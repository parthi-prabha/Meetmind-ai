"""SQLite persistence. Deterministic code only; no LLM involvement."""
import json
import sqlite3
from datetime import datetime, timezone

import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS meetings(
  id TEXT PRIMARY KEY, title TEXT, meeting_date TEXT, raw_transcript TEXT, status TEXT, error TEXT,
  mode TEXT, model TEXT, summary TEXT, warnings TEXT, errors TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS passages(
  id TEXT PRIMARY KEY, meeting_id TEXT, local_id TEXT, idx INTEGER, speaker TEXT, timestamp TEXT, text TEXT, raw TEXT);
CREATE TABLE IF NOT EXISTS key_points(id TEXT PRIMARY KEY, meeting_id TEXT, text TEXT, passage_ids TEXT);
CREATE TABLE IF NOT EXISTS decisions(
  id TEXT PRIMARY KEY, meeting_id TEXT, text TEXT, kind TEXT, status TEXT, supersedes_id TEXT,
  passage_ids TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS action_items(
  id TEXT PRIMARY KEY, meeting_id TEXT, description TEXT, owner TEXT, deadline_text TEXT,
  dependencies TEXT, passage_ids TEXT);
CREATE TABLE IF NOT EXISTS blockers(id TEXT PRIMARY KEY, meeting_id TEXT, text TEXT, kind TEXT, passage_ids TEXT);
CREATE TABLE IF NOT EXISTS decision_history(
  id TEXT PRIMARY KEY, meeting_id TEXT, new_decision_id TEXT, previous_decision_id TEXT, change_type TEXT,
  explanation TEXT, reason TEXT, reason_passage_ids TEXT, confidence REAL, needs_review INTEGER,
  new_passage_ids TEXT, previous_passage_ids TEXT, created_at TEXT);
"""


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect():
    conn = sqlite3.connect(config.db_path(), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def j(v):
    return json.dumps(v)


def create_meeting(conn, mid, title, date, transcript, mode, model):
    with conn:
        conn.execute("INSERT INTO meetings(id,title,meeting_date,raw_transcript,status,mode,model,created_at)"
                     " VALUES(?,?,?,?,?,?,?,?)", (mid, title, date, transcript, "processing", mode, model, now()))


def insert_passages(conn, mid, passages):
    with conn:
        conn.executemany(
            "INSERT INTO passages(id,meeting_id,local_id,idx,speaker,timestamp,text,raw) VALUES(?,?,?,?,?,?,?,?)",
            [(f"{mid}-{p['local_id']}", mid, p["local_id"], p["idx"], p["speaker"], p["timestamp"], p["text"], p["raw"])
             for p in passages])


def set_meeting_status(conn, mid, status, error=None, warnings=None, errors=None):
    with conn:
        conn.execute("UPDATE meetings SET status=?, error=?, warnings=COALESCE(?,warnings), errors=COALESCE(?,errors)"
                     " WHERE id=?", (status, error, j(warnings) if warnings is not None else None,
                                     j(errors) if errors is not None else None, mid))


def save_extraction(conn, mid, rec):
    ts = now()
    with conn:
        conn.execute("UPDATE meetings SET summary=? WHERE id=?", (rec["summary"], mid))
        conn.executemany("INSERT INTO key_points VALUES(?,?,?,?)",
                         [(k["id"], mid, k["text"], j(k["passage_ids"])) for k in rec["key_points"]])
        conn.executemany("INSERT INTO decisions VALUES(?,?,?,?,?,?,?,?)",
                         [(d["id"], mid, d["text"], d["kind"], d["status"], None, j(d["passage_ids"]), ts)
                          for d in rec["decisions"]])
        conn.executemany("INSERT INTO action_items VALUES(?,?,?,?,?,?,?)",
                         [(a["id"], mid, a["description"], a["owner"], a["deadline_text"], j(a["dependencies"]),
                           j(a["passage_ids"])) for a in rec["action_items"]])
        conn.executemany("INSERT INTO blockers VALUES(?,?,?,?,?)",
                         [(b["id"], mid, b["text"], b["kind"], j(b["passage_ids"])) for b in rec["blockers"]])


def get_historical_decisions(conn, mid, date):
    rows = conn.execute(
        "SELECT d.*, m.title AS meeting_title, m.meeting_date FROM decisions d JOIN meetings m ON m.id=d.meeting_id "
        "WHERE d.status IN ('active','proposed') AND d.meeting_id != ? AND m.meeting_date <= ? "
        "AND m.status IN ('complete','partial') ORDER BY m.meeting_date DESC, m.created_at DESC", (mid, date)).fetchall()
    return [dict(r, passage_ids=json.loads(r["passage_ids"])) for r in rows]


def evidence(conn, pids):
    if not pids:
        return []
    q = ",".join("?" * len(pids))
    rows = conn.execute(f"SELECT * FROM passages WHERE id IN ({q}) ORDER BY meeting_id, idx", list(pids)).fetchall()
    return [{"passage_id": r["id"], "local_id": r["local_id"], "speaker": r["speaker"], "timestamp": r["timestamp"],
             "text": r["text"]} for r in rows]


def apply_changes(conn, mid, changes):
    """Insert history rows and update decision statuses in ONE transaction. Decision text is never modified."""
    with conn:
        for i, c in enumerate(changes, 1):
            new = conn.execute("SELECT passage_ids FROM decisions WHERE id=?", (c["new_decision_id"],)).fetchone()
            prev_pids = "[]"
            if c["previous_decision_id"]:
                prev = conn.execute("SELECT passage_ids FROM decisions WHERE id=?", (c["previous_decision_id"],)).fetchone()
                prev_pids = prev["passage_ids"] if prev else "[]"
            conn.execute("INSERT INTO decision_history VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                         (f"{mid}-h{i}", mid, c["new_decision_id"], c["previous_decision_id"], c["change_type"],
                          c["explanation"], c["reason"], j(c["reason_passage_ids"]), c["confidence"],
                          1 if c["needs_review"] else 0, new["passage_ids"], prev_pids, now()))
            if c["change_type"] in ("revision", "reversal") and c["previous_decision_id"]:
                conn.execute("UPDATE decisions SET status='superseded' WHERE id=?", (c["previous_decision_id"],))
                conn.execute("UPDATE decisions SET supersedes_id=? WHERE id=?", (c["previous_decision_id"], c["new_decision_id"]))
            elif c["change_type"] == "reaffirmation" and c["previous_decision_id"]:
                conn.execute("UPDATE decisions SET status='reaffirmation' WHERE id=?", (c["new_decision_id"],))


def reset(conn):
    with conn:
        for t in ("decision_history", "blockers", "action_items", "decisions", "key_points", "passages", "meetings"):
            conn.execute(f"DELETE FROM {t}")
