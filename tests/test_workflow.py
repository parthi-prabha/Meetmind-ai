"""Run from the project root:  python -m unittest discover -s tests -t .  (no network or API key needed)"""
import json
import os
import tempfile
import time
import unittest
from unittest import mock

import config
import db
import demo_data
import llm
from agents import analyst, decision_intel, orchestrator
from transcript import parse_transcript


class TmpDb(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self._old = os.environ.get("MEETMIND_DB")
        os.environ["MEETMIND_DB"] = self.tmp.name
        self.conn = db.connect()

    def tearDown(self):
        self.conn.close()
        os.unlink(self.tmp.name)
        if self._old is None:
            os.environ.pop("MEETMIND_DB", None)
        else:
            os.environ["MEETMIND_DB"] = self._old

    def run_sample(self, i, client=None):
        s = demo_data.SAMPLES[i]
        return orchestrator.run(self.conn, client or llm.DemoClient(s["id"]), s["title"], s["date"], s["transcript"])


class FakeClient:
    mode, model = "groq", "fake-model"

    def __init__(self, outputs):
        self.outputs, self.calls = list(outputs), 0

    def chat(self, messages, agent="", context=None, max_tokens=0):
        self.calls += 1
        out = self.outputs.pop(0)
        if isinstance(out, Exception):
            raise out
        return out if isinstance(out, str) else json.dumps(out)


class TestParser(unittest.TestCase):
    def test_formats(self):
        ps = parse_transcript("[00:01:05] Alice: Hi there\nBob (00:02): Yo\nCarol: Plain\nno speaker line\n\n")
        self.assertEqual([(p["speaker"], p["timestamp"], p["text"]) for p in ps],
                         [("Alice", "00:01:05", "Hi there"), ("Bob", "00:02", "Yo"), ("Carol", None, "Plain"),
                          (None, None, "no speaker line")])
        self.assertEqual([p["local_id"] for p in ps], ["p1", "p2", "p3", "p4"])


class TestEndToEndDemo(TmpDb):
    def test_three_connected_meetings(self):
        r1, r2, r3 = self.run_sample(0), self.run_sample(1), self.run_sample(2)
        # transcript is stored unchanged
        stored = self.conn.execute("SELECT raw_transcript FROM meetings WHERE id=?", (r1["meeting"]["id"],)).fetchone()[0]
        self.assertEqual(stored, demo_data.SAMPLES[0]["transcript"])
        for r in (r1, r2, r3):
            self.assertEqual(r["meeting"]["status"], "complete")
            self.assertEqual(r["warnings"], [])
            for d in r["decisions"]:
                self.assertTrue(d["evidence"])
                self.assertTrue(all(e["passage_id"].startswith(r["meeting"]["id"]) for e in d["evidence"]))
        # meeting 1: everything is new, no LLM comparison
        self.assertTrue(all(d["change"]["change_type"] == "new" for d in r1["decisions"]))
        self.assertEqual(r1["trace"][4]["status"], "skipped")
        self.assertEqual(r1["action_items"][0]["owner"], "Bob")
        # meeting 2: revision with a stated reason + reaffirmation, old decision preserved and superseded
        rev = next(c for c in r2["decision_changes"] if c["change_type"] == "revision")
        self.assertIn("vendor", rev["reason"])
        self.assertTrue(rev["reason_evidence"])
        self.assertEqual(rev["previous_decision"]["text"], "Target October 15 for the beta launch.")
        self.assertEqual(rev["previous_decision"]["status"], "superseded")
        new = next(d for d in r2["decisions"] if "November 5" in d["text"])
        self.assertEqual(new["supersedes_id"], rev["previous_decision"]["id"])
        self.assertTrue(any(c["change_type"] == "reaffirmation" for c in r2["decision_changes"]))
        # meeting 3: reversal without a stated reason + an ambiguous proposal flagged for review
        revs = next(c for c in r3["decision_changes"] if c["change_type"] == "reversal")
        self.assertIsNone(revs["reason"])
        nr = next(c for c in r3["decision_changes"] if c["change_type"] == "needs_review")
        self.assertTrue(nr["needs_review"])
        self.assertNotEqual(nr["previous_decision"]["status"], "superseded")  # November 5 stays active
        # unresolved blocker persists across meetings; unknown owner stays unknown
        self.assertTrue(any("legal" in b["text"].lower() for b in r3["blockers"]))
        self.assertIsNone(r3["action_items"][0]["owner"])
        # history is preserved: all 3 original decisions of meeting 1 still exist
        n = self.conn.execute("SELECT COUNT(*) FROM decisions WHERE meeting_id=?", (r1["meeting"]["id"],)).fetchone()[0]
        self.assertEqual(n, 3)
        self.assertEqual(self.conn.execute("SELECT status FROM decisions WHERE id=?", (rev["previous_decision"]["id"],)).fetchone()[0], "superseded")


class TestGuardrails(TmpDb):
    PASSAGES = parse_transcript("[00:01] Alice: Bob will send the report by Friday.\n[00:02] Bob: ok")

    def test_sanitize_never_invents(self):
        raw = {"summary": "s", "key_points": [], "blockers": [],
               "decisions": [{"text": "ghost", "kind": "decision", "passage_ids": ["p99"]}],
               "action_items": [
                   {"description": "Send report", "owner": "Zed", "deadline_text": "next Monday", "dependencies": [], "passage_ids": ["p1"]},
                   {"description": "Send report 2", "owner": "Bob", "deadline_text": "Friday", "dependencies": [], "passage_ids": ["p1"]},
                   {"description": "Other", "owner": "unknown", "deadline_text": None, "dependencies": [], "passage_ids": ["p2", "p77"]}]}
        clean, warns = analyst.sanitize(raw, self.PASSAGES)
        self.assertEqual(clean["decisions"], [])
        a = clean["action_items"]
        self.assertEqual((a[0]["owner"], a[0]["deadline_text"]), (None, None))
        self.assertEqual((a[1]["owner"], a[1]["deadline_text"]), ("Bob", "Friday"))
        self.assertEqual((a[2]["owner"], a[2]["passage_ids"]), (None, ["p2"]))
        self.assertGreaterEqual(len(warns), 4)

    def _fin(self, **kw):
        base = {"new_decision_id": "m-d1", "change_type": "revision", "previous_decision_id": "m-old", "explanation": "x",
                "reason": "because", "reason_passage_ids": ["p1"], "confidence": 0.9}
        base.update(kw)
        kind = kw.pop("kind", "decision") if "kind" in kw else "decision"
        return decision_intel.finalize([base], [{"id": "m-d1", "kind": kind}], "m", {"p1"})[0]

    def test_finalize_rules(self):
        self.assertEqual(self._fin()["change_type"], "revision")
        self.assertEqual(self._fin()["reason_passage_ids"], ["m-p1"])
        self.assertIsNone(self._fin(reason_passage_ids=["p9"])["reason"])        # unsupported reason dropped
        low = self._fin(confidence=0.4)
        self.assertEqual((low["change_type"], low["needs_review"]), ("needs_review", True))
        self.assertEqual(self._fin(previous_decision_id=None)["change_type"], "needs_review")
        self.assertEqual(self._fin(change_type="new")["previous_decision_id"], None)
        missing = decision_intel.finalize([], [{"id": "m-d1", "kind": "decision"}], "m", set())[0]
        self.assertEqual(missing["change_type"], "needs_review")
        prop = decision_intel.finalize([{"new_decision_id": "m-d1", "change_type": "reversal", "previous_decision_id": "m-old",
                                         "explanation": "x", "reason": None, "reason_passage_ids": [], "confidence": 0.9}],
                                       [{"id": "m-d1", "kind": "proposal"}], "m", set())[0]
        self.assertEqual(prop["change_type"], "needs_review")


class TestErrorHandling(TmpDb):
    T = "[00:01] Alice: We will ship on Friday.\n[00:02] Bob: I'll write the notes by Monday."
    GOOD = {"summary": "s", "key_points": [], "blockers": [], "action_items": [],
            "decisions": [{"text": "Ship on Friday.", "type": "decision", "passage_ids": ["p1"]}]}

    def go(self, client):
        return orchestrator.run(self.conn, client, "T", "2026-01-01", self.T)

    def test_retry_then_success(self):
        c = FakeClient(["not json at all", {"decisions": "bad"}, self.GOOD])
        r = self.go(c)
        self.assertEqual(c.calls, 3)
        self.assertEqual(r["decisions"][0]["text"], "Ship on Friday.")

    def test_invalid_output_fails_cleanly(self):
        with self.assertRaises(orchestrator.PipelineError) as cm:
            self.go(FakeClient(["nope", "nope", "nope"]))
        self.assertEqual(cm.exception.stage, "analyst")
        self.assertEqual(self.conn.execute("SELECT status FROM meetings").fetchone()[0], "failed")

    def test_decision_agent_failure_gives_partial_result(self):
        self.go(FakeClient([self.GOOD]))
        c = FakeClient([self.GOOD, "bad", "bad", "bad"])
        r = orchestrator.run(self.conn, c, "T2", "2026-02-01", self.T)
        self.assertEqual(r["meeting"]["status"], "partial")
        self.assertEqual(r["errors"][0]["stage"], "decision_intel")
        self.assertEqual(len(r["decisions"]), 1)  # extraction kept, source refs intact
        self.assertTrue(r["decisions"][0]["evidence"])

    def test_input_validation(self):
        with self.assertRaises(orchestrator.PipelineError):
            orchestrator.run(self.conn, FakeClient([]), "T", "2026-01-01", "   ")
        with self.assertRaises(orchestrator.PipelineError):
            orchestrator.run(self.conn, FakeClient([]), "T", "01/02/2026", self.T)


class TestGroqClient(unittest.TestCase):
    def resp(self, status, body, headers=None):
        m = mock.Mock(status_code=status, text=json.dumps(body), headers=headers or {})
        m.json.return_value = body
        return m

    def client(self, *responses):
        s = mock.Mock()
        s.post.side_effect = list(responses)
        return llm.GroqClient("k", "bad-model", session=s), s

    def test_ok(self):
        c, s = self.client(self.resp(200, {"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]}))
        self.assertEqual(c.chat([{"role": "user", "content": "x"}]), "{}")
        self.assertEqual(s.post.call_args.kwargs["json"]["response_format"], {"type": "json_object"})

    def test_model_unavailable_message(self):
        c, _ = self.client(self.resp(404, {"error": {"code": "model_not_found", "message": "The model `bad-model` does not exist"}}))
        with self.assertRaises(llm.ModelUnavailableError) as cm:
            c.chat([])
        self.assertIn("GROQ_MODEL", str(cm.exception))

    def test_auth_and_rate_limit(self):
        c, _ = self.client(self.resp(401, {"error": {"message": "Invalid API Key"}}))
        with self.assertRaises(llm.AuthError):
            c.chat([])
        with mock.patch("llm.time.sleep"):
            c, s = self.client(self.resp(429, {"error": {"message": "slow"}}, {"retry-after": "0"}),
                               self.resp(200, {"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]}))
            self.assertEqual(c.chat([]), "{}")
            self.assertEqual(s.post.call_count, 2)

    def test_json_mode_fallback(self):
        c, s = self.client(self.resp(400, {"error": {"message": "response_format is not supported"}}),
                           self.resp(200, {"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]}))
        c.chat([])
        self.assertNotIn("response_format", s.post.call_args.kwargs["json"])


class TestAPI(TmpDb):
    def setUp(self):
        super().setUp()
        import app as appmod
        self.appmod = appmod
        self.http = appmod.app.test_client()
        self._key = os.environ.pop("GROQ_API_KEY", None)

    def tearDown(self):
        if self._key:
            os.environ["GROQ_API_KEY"] = self._key
        super().tearDown()

    def wait(self, jid):
        for _ in range(100):
            j = self.http.get(f"/api/jobs/{jid}").get_json()
            if j["status"] != "running":
                return j
            time.sleep(0.05)
        self.fail("job did not finish")

    def test_demo_flow_and_errors(self):
        self.assertEqual(self.http.get("/api/config").get_json()["mode"], "demo")
        self.assertEqual(self.http.post("/api/analyze", json={"transcript": ""}).status_code, 400)
        r = self.http.post("/api/analyze", json={"transcript": "[00:01] Zed: custom text"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("Demo mode", r.get_json()["error"]["message"])
        for s in demo_data.SAMPLES:
            r = self.http.post("/api/analyze", json={"title": s["title"], "date": s["date"], "transcript": s["transcript"], "sample_id": s["id"]})
            self.assertEqual(r.status_code, 202)
            job = self.wait(r.get_json()["job_id"])
            self.assertEqual(job["status"], "done")
        h = self.http.get("/api/history").get_json()
        self.assertEqual([c["change_type"] for c in h["changes"]], ["revision", "reaffirmation", "reversal", "needs_review"])
        mid = job["result"]["meeting"]["id"]
        self.assertEqual(self.http.get(f"/api/meetings/{mid}").status_code, 200)
        self.assertEqual(len(self.http.get("/api/meetings").get_json()), 3)
        self.assertEqual(self.http.post("/api/reset").status_code, 200)
        self.assertEqual(self.http.get("/api/meetings").get_json(), [])

    def test_groq_error_is_reported_with_hint(self):
        err = llm.ModelUnavailableError("Groq model 'x' is unavailable. Set GROQ_MODEL in .env")
        self.appmod.app.client_factory = lambda sid, t: FakeClient([err])
        try:
            r = self.http.post("/api/analyze", json={"transcript": "[00:01] A: hi"})
            job = self.wait(r.get_json()["job_id"])
        finally:
            self.appmod.app.client_factory = self.appmod.make_client
        self.assertEqual(job["status"], "error")
        self.assertEqual(job["error"]["stage"], "analyst")
        self.assertIn("GROQ_MODEL", job["error"]["hint"])


if __name__ == "__main__":
    unittest.main()
