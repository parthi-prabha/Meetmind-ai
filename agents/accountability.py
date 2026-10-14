"""Agent 4: Accountability. Tracks action items across meetings.

Identifies duplicate tasks, overdue actions, missing owners, and repeated postponements.
Preserves source passage IDs and meeting IDs. Never invents missing information.
"""
import json
import re
from datetime import date as _date

import db
import llm


SYSTEM = """You are the Accountability Agent. You compare action items across meetings to find:
- DUPLICATE tasks: same work described in different meetings (mark as "duplicate")
- OVERDUE actions: a deadline was stated and the meeting date is past it (mark as "overdue")
- MISSING OWNER: an action has no owner assigned (mark as "missing_owner")
- REPEATED POSTPONEMENT: the same task appears in multiple meetings without completion (mark as "postponed")

Return ONLY one JSON object:
{"items": [
  {"action_id": str, "meeting_id": str, "description": str, "owner": str|null,
   "deadline_text": str|null, "status": "open"|"overdue"|"duplicate"|"postponed",
   "flags": ["missing_owner"|"overdue"|"duplicate"|"postponed"],
   "duplicate_of_id": str|null,
   "notes": str}
]}
Rules:
- Only use data from the provided action items. Never invent owners, deadlines, or statuses.
- duplicate_of_id should reference the earliest action_id that describes the same task.
- notes should be a brief factual explanation.
- If an item has no issues, flags should be [] and status "open"."""


def _get_all_action_items(conn):
    """Retrieve all action items with meeting metadata."""
    rows = conn.execute(
        "SELECT a.*, m.title AS meeting_title, m.meeting_date, m.status AS meeting_status "
        "FROM action_items a JOIN meetings m ON m.id = a.meeting_id "
        "WHERE m.status IN ('complete','partial') "
        "ORDER BY m.meeting_date, a.rowid"
    ).fetchall()
    return [dict(r) for r in rows]


def _norm(s):
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def _detect_missing_owners(items):
    """Deterministic: flag items with no owner."""
    flagged = []
    for it in items:
        if not it.get("owner"):
            flagged.append(it["id"])
    return flagged


def _detect_overdue(items, ref_date=None):
    """Deterministic: flag items whose deadline text contains a date that is in the past."""
    ref = ref_date or _date.today()
    overdue = []
    for it in items:
        dl = it.get("deadline_text") or ""
        # Try to find a date pattern in the deadline text
        m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", dl)
        if m:
            try:
                d = _date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                if d < ref:
                    overdue.append(it["id"])
            except ValueError:
                pass
    return overdue


def _tokens(text):
    stop = {"the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "we", "will", "is",
            "are", "be", "it", "that", "this", "with", "as", "at", "by", "from"}
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2 and t not in stop}


def _detect_duplicates(items):
    """Deterministic: high token overlap between descriptions from different meetings => potential duplicate."""
    dupes = {}  # action_id -> earliest action_id it duplicates
    for i, a in enumerate(items):
        ta = _tokens(a.get("description", ""))
        if not ta:
            continue
        for b in items[:i]:
            if a["meeting_id"] == b["meeting_id"]:
                continue
            tb = _tokens(b.get("description", ""))
            if not tb:
                continue
            overlap = len(ta & tb) / (len(ta | tb) or 1)
            if overlap >= 0.6:
                dupes[a["id"]] = b["id"]
                break
    return dupes


def _detect_postponements(items):
    """Items appearing in multiple meetings (high similarity) with no status change."""
    groups = {}  # cluster by similarity
    for it in items:
        tok = _tokens(it.get("description", ""))
        matched = False
        for key, members in groups.items():
            ref_tok = _tokens(members[0].get("description", ""))
            if ref_tok and tok and len(tok & ref_tok) / (len(tok | ref_tok) or 1) >= 0.6:
                members.append(it)
                matched = True
                break
        if not matched:
            groups[it["id"]] = [it]
    postponed = set()
    for key, members in groups.items():
        meetings = {m["meeting_id"] for m in members}
        if len(meetings) >= 2:
            # All except the earliest are postponements
            for m in members[1:]:
                postponed.add(m["id"])
    return postponed


def run_deterministic(conn):
    """Run accountability checks using only deterministic code (no LLM). Returns the tracker result."""
    items = _get_all_action_items(conn)
    if not items:
        return {"items": [], "summary": "No action items found across meetings."}

    missing = set(_detect_missing_owners(items))
    overdue = set(_detect_overdue(items))
    dupes = _detect_duplicates(items)
    postponed = _detect_postponements(items)

    result_items = []
    for it in items:
        flags = []
        status = "open"
        notes_parts = []

        if it["id"] in missing:
            flags.append("missing_owner")
            notes_parts.append("No owner assigned.")
        if it["id"] in overdue:
            flags.append("overdue")
            status = "overdue"
            notes_parts.append(f"Deadline '{it.get('deadline_text', '')}' appears to be in the past.")
        if it["id"] in dupes:
            flags.append("duplicate")
            if status == "open":
                status = "duplicate"
            notes_parts.append(f"Appears to duplicate {dupes[it['id']]}.")
        if it["id"] in postponed:
            flags.append("postponed")
            if status == "open":
                status = "postponed"
            notes_parts.append("Same task appears in multiple meetings.")

        pids = json.loads(it.get("passage_ids", "[]")) if isinstance(it.get("passage_ids"), str) else (it.get("passage_ids") or [])
        result_items.append({
            "action_id": it["id"],
            "meeting_id": it["meeting_id"],
            "meeting_title": it.get("meeting_title", ""),
            "meeting_date": it.get("meeting_date", ""),
            "description": it["description"],
            "owner": it.get("owner"),
            "deadline_text": it.get("deadline_text"),
            "status": status,
            "flags": flags,
            "duplicate_of_id": dupes.get(it["id"]),
            "passage_ids": pids,
            "evidence": db.evidence(conn, pids),
            "notes": " ".join(notes_parts) if notes_parts else "",
        })

    flagged = [i for i in result_items if i["flags"]]
    summary_parts = []
    if any("missing_owner" in i["flags"] for i in result_items):
        summary_parts.append(f"{sum(1 for i in result_items if 'missing_owner' in i['flags'])} missing owner(s)")
    if any("overdue" in i["flags"] for i in result_items):
        summary_parts.append(f"{sum(1 for i in result_items if 'overdue' in i['flags'])} overdue")
    if any("duplicate" in i["flags"] for i in result_items):
        summary_parts.append(f"{sum(1 for i in result_items if 'duplicate' in i['flags'])} duplicate(s)")
    if any("postponed" in i["flags"] for i in result_items):
        summary_parts.append(f"{sum(1 for i in result_items if 'postponed' in i['flags'])} postponed")

    summary = (f"{len(result_items)} action item(s) across {len({i['meeting_id'] for i in result_items})} meeting(s). "
               + (", ".join(summary_parts) + "." if summary_parts else "No issues found."))

    return {"items": result_items, "summary": summary}
