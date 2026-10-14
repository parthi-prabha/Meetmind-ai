"""Agent 1: Meeting Analyst. LLM extracts; deterministic code validates evidence, owners and deadlines."""
import re

import llm
import schemas

SYSTEM = """You are the Meeting Analyst Agent. Extract structured information from the meeting transcript.
Return ONLY one JSON object shaped like:
{"summary": str,
 "key_points": [{"text": str, "passage_ids": [str]}],
 "decisions": [{"text": str, "type": "decision"|"proposal", "passage_ids": [str]}],
 "action_items": [{"description": str, "owner": str|null, "deadline_text": str|null, "dependencies": [str], "passage_ids": [str]}],
 "blockers": [{"text": str, "kind": "blocker"|"risk"|"open_question", "passage_ids": [str]}]}
Rules:
- Use only what the transcript says. Never invent owners, deadlines, dependencies or evidence; use null (or []) when not stated.
- passage_ids must be ids shown in the transcript (e.g. "p3") that directly support the item.
- "decision" = the group agreed or someone with authority decided; "proposal" = suggested but not agreed.
- owner = a person named in the transcript who is responsible. deadline_text = the exact words used in the transcript.
- Write each text as one short, self-contained sentence. Use empty lists when nothing applies."""

_EMPTY = {"", "unknown", "none", "null", "n/a", "na", "tbd", "unassigned", "nobody", "no owner"}


def build_prompt(title, date, passages):
    lines = []
    for p in passages:
        who = f"{p['speaker']}: " if p["speaker"] else ""
        ts = f"{p['timestamp']} " if p["timestamp"] else ""
        lines.append(f"[{p['local_id']}] {ts}{who}{p['text']}")
    return f"Meeting: {title} ({date})\nTranscript:\n" + "\n".join(lines)


def run(client, title, date, passages):
    """Returns a structurally valid extraction (local passage ids). Raises llm.LLMError."""
    return llm.run_json(client, "analyst", SYSTEM, build_prompt(title, date, passages),
                        schemas.validate_analyst_output)


def _norm(s):
    return re.sub(r"\s+", " ", s.lower()).strip()


def sanitize(raw, passages):
    """Enforce evidence rules in code. Returns (clean_extraction, warnings). Never invents anything."""
    by_id = {p["local_id"]: p for p in passages}
    speakers = {p["speaker"].lower() for p in passages if p["speaker"]}
    warnings = []

    def keep_ids(item, label, text):
        ids = [i for i in dict.fromkeys(item["passage_ids"]) if i in by_id]
        if len(ids) != len(set(item["passage_ids"])):
            warnings.append(f"Removed unknown passage reference(s) from {label}: '{text[:60]}'")
        if not ids:
            warnings.append(f"Dropped {label} with no valid evidence: '{text[:60]}'")
        return ids

    out = {"summary": raw["summary"], "key_points": [], "decisions": [], "action_items": [], "blockers": []}
    for k in raw["key_points"]:
        ids = keep_ids(k, "key point", k["text"])
        if ids:
            out["key_points"].append({"text": k["text"], "passage_ids": ids})
    for d in raw["decisions"]:
        ids = keep_ids(d, d["kind"], d["text"])
        if ids:
            out["decisions"].append({"text": d["text"], "kind": d["kind"], "passage_ids": ids})
    for b in raw["blockers"]:
        ids = keep_ids(b, b["kind"], b["text"])
        if ids:
            out["blockers"].append({"text": b["text"], "kind": b["kind"], "passage_ids": ids})
    for a in raw["action_items"]:
        ids = keep_ids(a, "action item", a["description"])
        if not ids:
            continue
        cited = _norm(" ".join(by_id[i]["text"] for i in ids))
        owner, deadline = a["owner"], a["deadline_text"]
        if owner is not None and _norm(owner) in _EMPTY:
            owner = None
        if owner is not None:
            pat = r"\b" + re.escape(_norm(owner)) + r"\b"
            if not (re.search(pat, cited) or any(re.search(pat, s) for s in speakers)):
                warnings.append(f"Owner '{owner}' is not supported by the transcript; set to unknown "
                                f"for '{a['description'][:50]}'")
                owner = None
        if deadline is not None and _norm(deadline) in _EMPTY:
            deadline = None
        if deadline is not None and _norm(deadline) not in cited:
            warnings.append(f"Deadline '{deadline}' does not appear in the cited passages; set to unknown "
                            f"for '{a['description'][:50]}'")
            deadline = None
        out["action_items"].append({"description": a["description"], "owner": owner, "deadline_text": deadline,
                                    "dependencies": a["dependencies"], "passage_ids": ids})
    return out, warnings
