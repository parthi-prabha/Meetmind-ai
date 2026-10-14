"""Agent 3: Orchestrator. Pure workflow control: parse -> analyst -> validate/save -> retrieve -> decision intel -> persist -> accountability."""
import re
import time
import uuid
from datetime import date as _date

import config
import db
import llm
import results
from agents import analyst, decision_intel, accountability
from transcript import parse_transcript


class PipelineError(Exception):
    def __init__(self, stage, message, hint=None, meeting_id=None):
        super().__init__(message)
        self.stage, self.hint, self.meeting_id = stage, hint, meeting_id


class Trace:
    """Step-by-step execution status, readable by the UI while the pipeline is running."""
    STEPS = [("parse", "Parse transcript", "code"), ("analyst", "Meeting Analyst Agent", "llm"),
             ("save", "Validate and save extraction", "code"), ("retrieve", "Retrieve decision history", "code"),
             ("decision", "Decision Intelligence Agent", "llm"), ("persist", "Persist decision history", "code"),
             ("accountability", "Accountability Agent", "code")]

    def __init__(self):
        self.steps = [{"key": k, "label": l, "kind": kind, "status": "pending", "detail": "", "ms": None}
                      for k, l, kind in self.STEPS]
        self._t = {}

    def _s(self, key):
        return next(s for s in self.steps if s["key"] == key)

    def start(self, key):
        self._t[key] = time.time()
        self._s(key).update(status="running")

    def _end(self, key, status, detail):
        s = self._s(key)
        s.update(status=status, detail=detail, ms=int((time.time() - self._t[key]) * 1000) if key in self._t else None)

    def done(self, key, detail=""):
        self._end(key, "done", detail)

    def skip(self, key, detail=""):
        self._end(key, "skipped", detail)

    def fail(self, key, detail=""):
        self._end(key, "error", detail)


def _hint(e):
    if isinstance(e, llm.ModelUnavailableError):
        return "Set GROQ_MODEL in .env to a supported model (https://console.groq.com/docs/models) and restart the server."
    if isinstance(e, llm.AuthError):
        return "Check GROQ_API_KEY in your .env file."
    return None


def _clean_date(d):
    d = (d or "").strip()
    if not d:
        return _date.today().isoformat()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
        raise PipelineError("input", "Meeting date must be in YYYY-MM-DD format.")
    return d


def _assign_ids(mid, ex):
    """Stable ids are assigned by code (never by the model); local passage ids become globally unique ones."""
    g = lambda ids: [f"{mid}-{i}" for i in ids]
    return {
        "summary": ex["summary"],
        "key_points": [{"id": f"{mid}-k{n}", "text": x["text"], "passage_ids": g(x["passage_ids"])}
                       for n, x in enumerate(ex["key_points"], 1)],
        "decisions": [{"id": f"{mid}-d{n}", "text": x["text"], "kind": x["kind"],
                       "status": "active" if x["kind"] == "decision" else "proposed", "passage_ids": g(x["passage_ids"])}
                      for n, x in enumerate(ex["decisions"], 1)],
        "action_items": [{"id": f"{mid}-a{n}", **{k: x[k] for k in ("description", "owner", "deadline_text", "dependencies")},
                          "passage_ids": g(x["passage_ids"])} for n, x in enumerate(ex["action_items"], 1)],
        "blockers": [{"id": f"{mid}-b{n}", "text": x["text"], "kind": x["kind"], "passage_ids": g(x["passage_ids"])}
                     for n, x in enumerate(ex["blockers"], 1)],
    }


def _fail(conn, trace, mid, stage, e):
    db.set_meeting_status(conn, mid, "failed", str(e))
    trace.fail(stage, str(e))
    raise PipelineError(stage, str(e), hint=_hint(e), meeting_id=mid) from e


def run(conn, client, title, meeting_date, transcript, trace=None):
    trace = trace or Trace()
    title = (title or "").strip() or "Untitled meeting"
    meeting_date = _clean_date(meeting_date)
    if not transcript or not transcript.strip():
        raise PipelineError("input", "Transcript is empty. Paste or upload a transcript.")
    if len(transcript) > config.MAX_TRANSCRIPT_CHARS:
        raise PipelineError("input", f"Transcript is too long ({len(transcript):,} characters; limit "
                                     f"{config.MAX_TRANSCRIPT_CHARS:,}). Split it into smaller meetings.")
    mid = "m" + uuid.uuid4().hex[:8]
    warnings, errors = [], []

    trace.start("parse")
    passages = parse_transcript(transcript)
    if not passages:
        trace.fail("parse", "No text found")
        raise PipelineError("parse", "No passages could be read from the transcript.")
    db.create_meeting(conn, mid, title, meeting_date, transcript, client.mode, client.model)  # transcript stored unchanged
    db.insert_passages(conn, mid, passages)
    trace.done("parse", f"{len(passages)} passages")

    try:
        trace.start("analyst")
        try:
            raw = analyst.run(client, title, meeting_date, passages)
        except llm.LLMError as e:
            _fail(conn, trace, mid, "analyst", e)
        trace.done("analyst", client.model)

        trace.start("save")
        clean, w = analyst.sanitize(raw, passages)
        warnings += w
        rec = _assign_ids(mid, clean)
        db.save_extraction(conn, mid, rec)
        trace.done("save", f"{len(rec['decisions'])} decisions, {len(rec['action_items'])} action items, "
                           f"{len(rec['blockers'])} blockers/risks")

        trace.start("retrieve")
        hist = db.get_historical_decisions(conn, mid, meeting_date)
        cands = decision_intel.retrieve_candidates(rec["decisions"], hist)
        trace.done("retrieve", f"{len(cands)} earlier decision(s) selected from {len(hist)}")

        changes = None
        if not rec["decisions"]:
            trace.skip("decision", "No decisions in this meeting")
            trace.skip("persist", "Nothing to persist")
        elif not cands:
            trace.skip("decision", "No earlier decisions to compare; all marked new (no LLM call)")
            changes = decision_intel.all_new(rec["decisions"])
        else:
            trace.start("decision")
            try:
                payload = decision_intel.build_payload(conn, rec["decisions"], cands, mid)
                changes = decision_intel.run(client, payload, rec["decisions"], cands, mid, {p["local_id"] for p in passages})
                trace.done("decision", f"{sum(c['change_type'] != 'new' for c in changes)} change(s) found")
            except llm.LLMError as e:
                errors.append({"stage": "decision_intel", "message": str(e), "hint": _hint(e)})
                trace.fail("decision", str(e))
                trace.skip("persist", "Comparison failed; decisions saved without history links")
        if changes is not None:
            trace.start("persist")
            db.apply_changes(conn, mid, changes)
            trace.done("persist", f"{len(changes)} history record(s)")
        db.set_meeting_status(conn, mid, "partial" if errors else "complete",
                              errors[0]["message"] if errors else None, warnings=warnings, errors=errors)
    except PipelineError:
        raise
    except Exception as e:  # never leave a meeting stuck in 'processing'
        db.set_meeting_status(conn, mid, "failed", f"{type(e).__name__}: {e}")
        raise PipelineError("unexpected", f"{type(e).__name__}: {e}", meeting_id=mid) from e

    trace.start("accountability")
    try:
        tracker = accountability.run_deterministic(conn)
        trace.done("accountability", f"{len([i for i in tracker['items'] if i['flags']])} issue(s) found")
    except Exception as e:
        tracker = {"items": [], "summary": f"Accountability check failed: {e}"}
        trace.fail("accountability", str(e))

    result = results.build_result(conn, mid)
    result["accountability"] = tracker
    result["trace"] = trace.steps
    return result
