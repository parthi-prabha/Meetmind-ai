"""Agent 2: Decision Intelligence. Compares new decisions with stored history.

The LLM only judges the relationship between decisions. Candidate retrieval, id/evidence checks, confidence
thresholds and "never assert a change without support" rules are plain code.
"""
import json
import re

import db
import llm
import schemas

CONFIDENCE_FLOOR = 0.6  # below this, an asserted relationship is downgraded to needs_review

SYSTEM = """You are the Decision Intelligence Agent. Compare NEW decisions from the latest meeting with PREVIOUS decisions from earlier meetings.
Return ONLY JSON: {"results":[{"new_decision_id": str, "change_type": "new"|"reaffirmation"|"revision"|"reversal"|"possible_contradiction"|"needs_review", "previous_decision_id": str|null, "explanation": str, "reason": str|null, "reason_passage_ids": [str], "confidence": number between 0 and 1}]}
Return exactly one result per new decision.
- new: unrelated to every previous decision (previous_decision_id null).
- reaffirmation: the same decision restated or confirmed.
- revision: modifies a previous decision (date, scope, owner, number...).
- reversal: replaces a previous decision with the opposite.
- possible_contradiction: conflicts with a previous decision, but the evidence does not say it replaces it.
- needs_review: the evidence is ambiguous or you are unsure.
Rules: previous_decision_id must be one of the given previous ids. Never assert a change the evidence does not support; if ambiguous use needs_review and a lower confidence.
"reason" = why the decision changed, ONLY if a passage of the new meeting states it; cite that passage in reason_passage_ids (e.g. ["p2"]). Otherwise reason is null and reason_passage_ids is [].
explanation = one or two factual sentences comparing old and new. Do not speculate."""

_STOP = set("the a an and or to of for in on we will is are be it that this with as at by from our us do not "
            "should would could can".split())


def _tokens(text):
    return {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2 and t not in _STOP}


def retrieve_candidates(new_decisions, hist, send_all_up_to=15, per_decision=5, cap=20):
    """Deterministic retrieval of relevant earlier decisions (token overlap; everything if the history is small)."""
    if len(hist) <= send_all_up_to:
        return list(hist)
    picked, seen = [], set()
    for nd in new_decisions:
        nt = _tokens(nd["text"])
        scored = sorted(((len(nt & _tokens(h["text"])) / (len(nt | _tokens(h["text"])) or 1), i)
                         for i, h in enumerate(hist)), reverse=True)
        for score, i in scored[:per_decision]:
            if score > 0 and i not in seen:
                seen.add(i)
                picked.append(hist[i])
    return picked[:cap]


def build_payload(conn, new_decisions, cands, meeting_id):
    def local(gid):
        return gid[len(meeting_id) + 1:]

    new = [{"id": d["id"], "kind": d["kind"], "text": d["text"],
            "evidence": [{"passage_id": local(e["passage_id"]), "speaker": e["speaker"], "text": e["text"]}
                         for e in db.evidence(conn, d["passage_ids"])]} for d in new_decisions]
    prev = [{"id": c["id"], "meeting": c["meeting_title"], "date": c["meeting_date"], "kind": c["kind"],
             "status": c["status"], "text": c["text"],
             "evidence": [{"speaker": e["speaker"], "text": e["text"]} for e in db.evidence(conn, c["passage_ids"])]}
            for c in cands]
    return {"new_decisions": new, "previous_decisions": prev}


def all_new(new_decisions):
    return [_row(d["id"], "new", None, "No earlier decisions to compare against.", None, [], 1.0) for d in new_decisions]


def _row(nid, ct, prev, expl, reason, reason_pids, conf):
    return {"new_decision_id": nid, "change_type": ct, "previous_decision_id": prev, "explanation": expl,
            "reason": reason, "reason_passage_ids": reason_pids, "confidence": conf,
            "needs_review": ct in ("needs_review", "possible_contradiction")}


def run(client, payload, new_decisions, cands, meeting_id, new_local_ids):
    """Returns finalized change records (global ids) for every new decision. Raises llm.LLMError."""
    new_ids = {d["id"] for d in new_decisions}
    cand_ids = {c["id"] for c in cands}
    user = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    results = llm.run_json(client, "decision_intel", SYSTEM, user,
                           lambda raw: schemas.validate_di_output(raw, new_ids, cand_ids), context=payload)
    return finalize(results, new_decisions, meeting_id, new_local_ids)


def finalize(results, new_decisions, meeting_id, new_local_ids):
    """Deterministic guardrails applied to the model's judgement."""
    by_new = {r["new_decision_id"]: r for r in results}
    out, superseded = [], set()
    for d in new_decisions:
        r = by_new.get(d["id"])
        if r is None:
            out.append(_row(d["id"], "needs_review", None,
                            "The model returned no assessment for this decision; review it manually.", None, [], 0.0))
            continue
        ct, prev, expl, conf = r["change_type"], r["previous_decision_id"], r["explanation"], r["confidence"]
        notes = []
        if ct == "new":
            prev = None
        elif ct != "needs_review" and not prev:
            notes.append(f"model said '{ct}' but identified no previous decision")
            ct = "needs_review"
        if ct in ("reaffirmation", "revision", "reversal", "possible_contradiction") and conf < CONFIDENCE_FLOOR:
            notes.append(f"model said '{ct}' with low confidence ({conf:.0%})")
            ct = "needs_review"
        if ct in ("revision", "reversal") and d["kind"] == "proposal":
            notes.append("this is a proposal that was not agreed, so it cannot supersede a decision")
            ct = "needs_review"
        if ct in ("revision", "reversal") and prev in superseded:
            notes.append("the previous decision is already superseded by another new decision in this meeting")
            ct = "needs_review"
        if ct in ("revision", "reversal"):
            superseded.add(prev)
        reason, rp = r["reason"], [p for p in r["reason_passage_ids"] if p in new_local_ids]
        if not reason or not rp:  # a reason is only kept when a passage of this meeting supports it
            reason, rp = None, []
        if notes:
            expl = f"{expl} (Downgraded to needs review: {'; '.join(notes)}.)".strip()
        out.append(_row(d["id"], ct, prev, expl, reason, [f"{meeting_id}-{p}" for p in rp], conf))
    return out
