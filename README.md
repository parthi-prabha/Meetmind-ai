# MeetMind AI (3-agent MVP)

Meeting transcript in -> decisions, action items, blockers out, with every claim linked to its source passage,
and decisions tracked across meetings (new / reaffirmed / revised / reversed / needs review).

## Run it

```bash
cd meetmind-ai
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Windows: copy .env.example .env
python app.py                      # http://127.0.0.1:5000
```

- **Without a key** the app starts in clearly labelled **DEMO MODE**: the 3 bundled sample meetings return
  pre-written agent output (not model output) through the real parser, validators, orchestrator, database and UI.
- **With Groq**: put `GROQ_API_KEY` (and optionally `GROQ_MODEL`) in `.env`, restart. The key is read server-side only.
  If the model is unavailable you get a clear error telling you to set a supported `GROQ_MODEL`; there is no silent fallback.

## Demo script
1. Click **Run all 3 samples** (resets data, analyzes the meetings in order) - opens the **Decision history** tab.
2. Show: Oct 15 launch -> **Revised** to Nov 5 (with stated reason + evidence); Postgres **Reaffirmed**;
   web-only -> **Reversed** (no reason stated, and the UI says so); "hold launch for legal" -> **Needs review**.
3. Open a meeting tab: the legal-review blocker appears in all three meetings, still unresolved; an action item with owner **unknown**.
4. Expand any "Evidence" to see speaker, timestamp, original passage.

## Tests
```bash
python -m unittest discover -s tests -t .
```

## Layout
| File | Role |
|---|---|
| `agents/analyst.py` | Agent 1: Meeting Analyst (LLM) + code that drops unsupported evidence, owners, deadlines |
| `agents/decision_intel.py` | Agent 2: Decision Intelligence (LLM) + code for retrieval, confidence floor, reason-evidence rule |
| `agents/orchestrator.py` | Agent 3: Orchestrator, deterministic workflow, error handling, step status |
| `llm.py` | Groq client, demo client, validate-and-retry helper |
| `schemas.py`, `transcript.py`, `db.py`, `results.py` | Validation, parsing, SQLite, unified result |
| `demo_data.py` | Sample meetings and pre-written demo outputs |
| `app.py`, `static/` | Flask API and the single-page UI |

## Known limits
- Demo mode only analyzes the bundled samples, unchanged.
- Decision retrieval is token overlap (everything is sent if history <= 15 decisions); no vector search.
- Blockers are listed per meeting; there is no agent that marks them resolved.
- Transcripts over 40,000 characters are rejected; no authentication; development server only.
