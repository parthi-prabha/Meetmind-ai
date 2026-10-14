"""Agent 5: Memory & Research. Answers user questions across stored meetings.

Retrieves relevant transcript passages, decisions, and action items.
Provides evidence citations with meeting ID, passage ID, speaker, and timestamp.
Returns an insufficient-evidence response when the sources do not support an answer.
Reuses the existing Groq client, model configuration, and validation logic.
"""
import json
import re

import db
import llm


SYSTEM = """You are the Memory & Research Agent. Answer user questions based ONLY on the provided meeting data.
Return ONLY one JSON object:
{"answer": str, "confidence": "high"|"medium"|"low"|"insufficient",
 "citations": [{"meeting_id": str, "meeting_title": str, "passage_id": str|null, "speaker": str|null, "timestamp": str|null, "text": str}],
 "related_decisions": [str],
 "related_action_items": [str]}
Rules:
- Base your answer ONLY on the provided passages, decisions, and action items. Never invent information.
- If the evidence does not support an answer, set confidence to "insufficient" and explain what is missing.
- citations must reference actual passages from the provided data.
- related_decisions and related_action_items list the IDs of relevant items.
- Keep the answer concise and factual."""


def _tokens(text):
    stop = {"the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "we", "will", "is",
            "are", "be", "it", "that", "this", "with", "as", "at", "by", "from", "our", "us"}
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2 and t not in stop}


def _gather_context(conn, question, max_passages=40):
    """Retrieve meeting data relevant to the question using token overlap ranking."""
    qtokens = _tokens(question)
    if not qtokens:
        return None

    meetings = conn.execute(
        "SELECT id, title, meeting_date FROM meetings WHERE status IN ('complete','partial') "
        "ORDER BY meeting_date DESC"
    ).fetchall()
    if not meetings:
        return None

    # Gather and rank passages
    all_passages = []
    for m in meetings:
        rows = conn.execute(
            "SELECT id, local_id, speaker, timestamp, text FROM passages WHERE meeting_id=? ORDER BY idx",
            (m["id"],)
        ).fetchall()
        for r in rows:
            ptokens = _tokens(r["text"])
            score = len(qtokens & ptokens) / (len(qtokens | ptokens) or 1) if ptokens else 0
            all_passages.append({
                "passage_id": r["id"], "local_id": r["local_id"],
                "meeting_id": m["id"], "meeting_title": m["title"], "meeting_date": m["meeting_date"],
                "speaker": r["speaker"], "timestamp": r["timestamp"], "text": r["text"],
                "score": score
            })

    # Sort by relevance, take top
    all_passages.sort(key=lambda x: x["score"], reverse=True)
    top_passages = [p for p in all_passages[:max_passages] if p["score"] > 0]

    # If no passages matched, take a broader sample
    if not top_passages:
        top_passages = all_passages[:max_passages]

    # Gather decisions
    relevant_meeting_ids = list({p["meeting_id"] for p in top_passages})
    decisions = []
    for mid in relevant_meeting_ids:
        rows = conn.execute(
            "SELECT id, text, kind, status, passage_ids FROM decisions WHERE meeting_id=? ORDER BY rowid",
            (mid,)
        ).fetchall()
        m = conn.execute("SELECT title, meeting_date FROM meetings WHERE id=?", (mid,)).fetchone()
        for r in rows:
            decisions.append({
                "id": r["id"], "meeting_id": mid, "meeting_title": m["title"],
                "meeting_date": m["meeting_date"], "text": r["text"],
                "kind": r["kind"], "status": r["status"]
            })

    # Gather action items
    action_items = []
    for mid in relevant_meeting_ids:
        rows = conn.execute(
            "SELECT id, description, owner, deadline_text FROM action_items WHERE meeting_id=? ORDER BY rowid",
            (mid,)
        ).fetchall()
        m = conn.execute("SELECT title, meeting_date FROM meetings WHERE id=?", (mid,)).fetchone()
        for r in rows:
            action_items.append({
                "id": r["id"], "meeting_id": mid, "meeting_title": m["title"],
                "meeting_date": m["meeting_date"], "description": r["description"],
                "owner": r["owner"], "deadline_text": r["deadline_text"]
            })

    return {
        "passages": [{k: v for k, v in p.items() if k != "score"} for p in top_passages],
        "decisions": decisions,
        "action_items": action_items,
    }


def _validate_answer(raw):
    """Validate LLM answer structure."""
    if not isinstance(raw, dict):
        raise ValueError("Top level must be a JSON object")
    answer = raw.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("'answer' must be a non-empty string")
    conf = raw.get("confidence", "medium")
    if conf not in ("high", "medium", "low", "insufficient"):
        conf = "medium"
    citations = raw.get("citations", [])
    if not isinstance(citations, list):
        citations = []
    clean_citations = []
    for c in citations:
        if isinstance(c, dict):
            clean_citations.append({
                "meeting_id": c.get("meeting_id", ""),
                "meeting_title": c.get("meeting_title", ""),
                "passage_id": c.get("passage_id"),
                "speaker": c.get("speaker"),
                "timestamp": c.get("timestamp"),
                "text": c.get("text", ""),
            })
    rel_dec = raw.get("related_decisions", [])
    if not isinstance(rel_dec, list):
        rel_dec = []
    rel_act = raw.get("related_action_items", [])
    if not isinstance(rel_act, list):
        rel_act = []
    return {
        "answer": answer.strip(),
        "confidence": conf,
        "citations": clean_citations,
        "related_decisions": [d for d in rel_dec if isinstance(d, str)],
        "related_action_items": [a for a in rel_act if isinstance(a, str)],
    }


def run(client, conn, question):
    """Answer a question across stored meetings. Returns the answer dict. Raises llm.LLMError."""
    if not question or not question.strip():
        return {"answer": "Please provide a question.", "confidence": "insufficient", "citations": [],
                "related_decisions": [], "related_action_items": []}

    context = _gather_context(conn, question)
    if context is None:
        return {"answer": "No meetings found in the database. Analyze some meetings first.",
                "confidence": "insufficient", "citations": [], "related_decisions": [], "related_action_items": []}

    user_prompt = json.dumps({
        "question": question,
        "meeting_data": context,
    }, separators=(",", ":"), ensure_ascii=False)

    return llm.run_json(
        client, "memory_research", SYSTEM, user_prompt,
        _validate_answer, max_retries=2, max_tokens=2048
    )
