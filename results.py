"""Builds the unified result object (used by the orchestrator and by GET endpoints) from the database."""
import json

import db


def _decision_view(conn, r, m=None):
    if m is None:
        m = conn.execute("SELECT title, meeting_date FROM meetings WHERE id=?", (r["meeting_id"],)).fetchone()
    return {"id": r["id"], "meeting_id": r["meeting_id"], "meeting_title": m["title"] if m else None,
            "meeting_date": m["meeting_date"] if m else None, "text": r["text"], "kind": r["kind"],
            "status": r["status"], "supersedes_id": r["supersedes_id"],
            "evidence": db.evidence(conn, json.loads(r["passage_ids"]))}


def _change_view(conn, h):
    new = conn.execute("SELECT * FROM decisions WHERE id=?", (h["new_decision_id"],)).fetchone()
    prev = conn.execute("SELECT * FROM decisions WHERE id=?", (h["previous_decision_id"],)).fetchone() \
        if h["previous_decision_id"] else None
    return {"id": h["id"], "meeting_id": h["meeting_id"], "change_type": h["change_type"],
            "needs_review": bool(h["needs_review"]), "confidence": h["confidence"], "explanation": h["explanation"],
            "reason": h["reason"], "reason_evidence": db.evidence(conn, json.loads(h["reason_passage_ids"] or "[]")),
            "new_decision": _decision_view(conn, new) if new else None,
            "previous_decision": _decision_view(conn, prev) if prev else None}


def build_result(conn, mid):
    m = conn.execute("SELECT * FROM meetings WHERE id=?", (mid,)).fetchone()
    if not m:
        return None
    changes = [_change_view(conn, h) for h in conn.execute(
        "SELECT * FROM decision_history WHERE meeting_id=? ORDER BY rowid", (mid,))]
    by_new = {c["new_decision"]["id"]: {k: v for k, v in c.items() if k not in ("new_decision",)} for c in changes if c["new_decision"]}
    decisions = []
    for r in conn.execute("SELECT * FROM decisions WHERE meeting_id=? ORDER BY rowid", (mid,)):
        v = _decision_view(conn, r, m)
        v["change"] = by_new.get(r["id"])
        decisions.append(v)
    ev = lambda raw: db.evidence(conn, json.loads(raw))
    return {
        "meeting": {"id": m["id"], "title": m["title"], "date": m["meeting_date"], "status": m["status"],
                    "mode": m["mode"], "model": m["model"], "created_at": m["created_at"],
                    "passage_count": conn.execute("SELECT COUNT(*) c FROM passages WHERE meeting_id=?", (mid,)).fetchone()["c"]},
        "summary": m["summary"] or "",
        "key_points": [{"id": r["id"], "text": r["text"], "evidence": ev(r["passage_ids"])}
                       for r in conn.execute("SELECT * FROM key_points WHERE meeting_id=? ORDER BY rowid", (mid,))],
        "decisions": decisions,
        "action_items": [{"id": r["id"], "meeting_id": mid, "description": r["description"], "owner": r["owner"],
                          "deadline_text": r["deadline_text"], "dependencies": json.loads(r["dependencies"]),
                          "evidence": ev(r["passage_ids"])}
                         for r in conn.execute("SELECT * FROM action_items WHERE meeting_id=? ORDER BY rowid", (mid,))],
        "blockers": [{"id": r["id"], "meeting_id": mid, "text": r["text"], "kind": r["kind"], "evidence": ev(r["passage_ids"])}
                     for r in conn.execute("SELECT * FROM blockers WHERE meeting_id=? ORDER BY rowid", (mid,))],
        "decision_changes": changes,
        "warnings": json.loads(m["warnings"] or "[]"),
        "errors": json.loads(m["errors"] or "[]"),
    }


def list_meetings(conn):
    return [dict(r) for r in conn.execute(
        "SELECT id, title, meeting_date AS date, status, mode, created_at FROM meetings ORDER BY meeting_date, created_at")]


def build_history(conn):
    """Cross-meeting ledger: every non-'new' change (oldest first) plus the current decision state."""
    changes = [_change_view(conn, h) for h in conn.execute(
        "SELECT h.* FROM decision_history h JOIN meetings m ON m.id=h.meeting_id "
        "WHERE h.change_type != 'new' ORDER BY m.meeting_date, m.created_at, h.rowid")]
    current = [_decision_view(conn, r) for r in conn.execute(
        "SELECT d.* FROM decisions d JOIN meetings m ON m.id=d.meeting_id "
        "WHERE d.status IN ('active','proposed') ORDER BY m.meeting_date, d.rowid")]
    return {"changes": changes, "current": current}
