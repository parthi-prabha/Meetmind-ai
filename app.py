"""MeetMind AI - Flask backend. All LLM calls happen server-side; the API key never reaches the browser."""
import os
import threading
import uuid

from flask import Flask, jsonify, request, send_from_directory

import config
import db
import demo_data
import llm
import results
from agents import orchestrator

app = Flask(__name__, static_folder="static", static_url_path="")
JOBS = {}


def make_client(sample_id, transcript):
    """Groq when GROQ_API_KEY is set; otherwise clearly-labelled demo mode (bundled samples only)."""
    key = config.groq_api_key()
    if key:
        return llm.GroqClient(key, config.groq_model())
    sample = demo_data.find_sample(sample_id)
    if not sample or sample["transcript"].strip() != (transcript or "").strip():
        raise orchestrator.PipelineError(
            "demo_mode", "Demo mode (no GROQ_API_KEY) only analyzes the bundled sample meetings, unchanged.",
            hint="Set GROQ_API_KEY in .env and restart the server to analyze your own transcripts.")
    return llm.DemoClient(sample["id"])


app.client_factory = make_client


def _start_job(client, title, date, transcript):
    jid = uuid.uuid4().hex[:10]
    trace = orchestrator.Trace()
    job = {"id": jid, "status": "running", "trace": trace.steps, "result": None, "error": None}
    JOBS[jid] = job

    def work():
        conn = db.connect()
        try:
            job["result"] = orchestrator.run(conn, client, title, date, transcript, trace=trace)
            job["status"] = "done"
        except orchestrator.PipelineError as e:
            job["error"] = {"stage": e.stage, "message": str(e), "hint": e.hint, "meeting_id": e.meeting_id}
            job["status"] = "error"
        except Exception as e:  # last-resort guard so the UI never polls forever
            job["error"] = {"stage": "unexpected", "message": f"{type(e).__name__}: {e}", "hint": None, "meeting_id": None}
            job["status"] = "error"
        finally:
            conn.close()

    threading.Thread(target=work, daemon=True).start()
    return jid


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/config")
def api_config():
    key = bool(config.groq_api_key())
    return jsonify({"mode": "groq" if key else "demo", "model": config.groq_model() if key else None})


@app.get("/api/samples")
def api_samples():
    return jsonify(demo_data.SAMPLES)


@app.post("/api/analyze")
def api_analyze():
    body = request.get_json(silent=True) or {}
    transcript = body.get("transcript") or ""
    try:
        if not transcript.strip():
            raise orchestrator.PipelineError("input", "Transcript is empty. Paste or upload a transcript.")
        client = app.client_factory(body.get("sample_id"), transcript)
    except orchestrator.PipelineError as e:
        return jsonify({"error": {"stage": e.stage, "message": str(e), "hint": e.hint}}), 400
    return jsonify({"job_id": _start_job(client, body.get("title"), body.get("date"), transcript)}), 202


@app.get("/api/jobs/<jid>")
def api_job(jid):
    job = JOBS.get(jid)
    if not job:
        return jsonify({"error": {"message": "Unknown job"}}), 404
    return jsonify(job)


@app.get("/api/meetings")
def api_meetings():
    conn = db.connect()
    try:
        return jsonify(results.list_meetings(conn))
    finally:
        conn.close()


@app.get("/api/meetings/<mid>")
def api_meeting(mid):
    conn = db.connect()
    try:
        r = results.build_result(conn, mid)
        return (jsonify(r), 200) if r else (jsonify({"error": {"message": "Meeting not found"}}), 404)
    finally:
        conn.close()


@app.get("/api/history")
def api_history():
    conn = db.connect()
    try:
        return jsonify(results.build_history(conn))
    finally:
        conn.close()


@app.post("/api/reset")
def api_reset():
    conn = db.connect()
    try:
        db.reset(conn)
    finally:
        conn.close()
    JOBS.clear()
    return jsonify({"ok": True})


@app.get("/api/accountability")
def api_accountability():
    from agents import accountability
    conn = db.connect()
    try:
        return jsonify(accountability.run_deterministic(conn))
    finally:
        conn.close()


@app.post("/api/ask")
def api_ask():
    from agents import memory_research
    body = request.get_json(silent=True) or {}
    question = (body.get("question") or "").strip()
    if not question:
        return jsonify({"error": {"message": "Please provide a question."}}), 400
    key = config.groq_api_key()
    if not key:
        return jsonify({"error": {"message": "Cross-meeting questions require a Groq API key. Set GROQ_API_KEY in .env.",
                                  "hint": "Demo mode does not support the Memory & Research Agent."}}), 400
    client = llm.GroqClient(key, config.groq_model())
    conn = db.connect()
    try:
        result = memory_research.run(client, conn, question)
        return jsonify(result)
    except llm.LLMError as e:
        return jsonify({"error": {"message": str(e)}}), 500
    finally:
        conn.close()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    mode = f"Groq ({config.groq_model()})" if config.groq_api_key() else "DEMO MODE (no GROQ_API_KEY: bundled samples only)"
    print(f"MeetMind AI running at http://127.0.0.1:{port}  |  LLM: {mode}")
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
