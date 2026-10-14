"""Three connected sample meetings + canned agent outputs for DEMO MODE (no API key).

Demo outputs are pre-written, NOT model output. They still go through the real parser, validators,
orchestrator, database and UI.
"""

SAMPLES = [
    {"id": "sample-1-kickoff", "title": "Beta Kickoff", "date": "2026-09-01", "transcript": """\
[00:00:10] Alice: Thanks everyone. Goal today is to lock the beta plan.
[00:01:05] Bob: I propose we target an October 15 beta launch.
[00:01:40] Alice: Agreed. We are going with October 15 for the beta launch.
[00:02:30] Carol: For storage, let's build on Postgres. Nobody objected, so that's decided.
[00:03:15] Alice: Beta will be web only. Mobile comes after general availability.
[00:04:00] Bob: I'll draft the API spec by September 8.
[00:04:45] Carol: One blocker: legal still has to review our data retention policy and nobody has contacted them.
[00:05:30] Alice: Also an open question: who is paying for the SMS provider?
"""},
    {"id": "sample-2-sprint", "title": "Sprint Review", "date": "2026-09-15", "transcript": """\
[00:00:05] Alice: Quick status before we decide anything.
[00:01:10] Bob: The payments vendor sandbox is delayed by three weeks, so October 15 is not realistic.
[00:02:00] Alice: Then we move the beta launch to November 5.
[00:02:45] Carol: Postgres is working well, so we keep it.
[00:03:30] Bob: I will follow up with the payments vendor by September 20.
[00:04:20] Carol: Legal review is still not started. We still don't have an owner for it.
[00:05:00] Alice: The SMS provider question is still open too.
"""},
    {"id": "sample-3-leadership", "title": "Leadership Check-in", "date": "2026-10-01", "transcript": """\
[00:00:08] Alice: Dana from leadership joined us to talk about beta scope.
[00:01:00] Dana: We will include the mobile app in the beta after all.
[00:01:50] Carol: Mobile in beta means more QA time. Maybe we should hold the launch until legal signs off, but I'm not sure about that.
[00:02:40] Alice: Let's not change the date yet. We'll see where legal lands.
[00:03:20] Alice: Someone needs to chase legal this week.
[00:04:00] Carol: Legal review still hasn't started. That's now a launch risk.
"""},
]

DEMO_ANALYST = {
    "sample-1-kickoff": {
        "summary": "The team set the beta plan: an October 15 launch, Postgres, and a web-only scope.",
        "key_points": [{"text": "Launch date, storage and scope were agreed for the beta.", "passage_ids": ["p3", "p4", "p5"]}],
        "decisions": [
            {"text": "Target October 15 for the beta launch.", "type": "decision", "passage_ids": ["p2", "p3"]},
            {"text": "Build on Postgres for storage.", "type": "decision", "passage_ids": ["p4"]},
            {"text": "The beta is web only; mobile comes after general availability.", "type": "decision", "passage_ids": ["p5"]}],
        "action_items": [{"description": "Draft the API spec.", "owner": "Bob", "deadline_text": "September 8",
                          "dependencies": [], "passage_ids": ["p6"]}],
        "blockers": [
            {"text": "Legal has not been contacted about the data retention policy review.", "kind": "blocker", "passage_ids": ["p7"]},
            {"text": "It is undecided who pays for the SMS provider.", "kind": "open_question", "passage_ids": ["p8"]}]},
    "sample-2-sprint": {
        "summary": "A vendor delay pushed the beta launch to November 5. Legal review is still unowned.",
        "key_points": [{"text": "The payments vendor sandbox delay makes October 15 unrealistic.", "passage_ids": ["p2"]}],
        "decisions": [
            {"text": "Move the beta launch to November 5.", "type": "decision", "passage_ids": ["p2", "p3"]},
            {"text": "Keep Postgres for storage.", "type": "decision", "passage_ids": ["p4"]}],
        "action_items": [{"description": "Follow up with the payments vendor.", "owner": "Bob", "deadline_text": "September 20",
                          "dependencies": [], "passage_ids": ["p5"]}],
        "blockers": [
            {"text": "The payments vendor sandbox is delayed by three weeks.", "kind": "blocker", "passage_ids": ["p2"]},
            {"text": "The legal review has not started and has no owner.", "kind": "blocker", "passage_ids": ["p6"]},
            {"text": "It is still undecided who pays for the SMS provider.", "kind": "open_question", "passage_ids": ["p7"]}]},
    "sample-3-leadership": {
        "summary": "Leadership added mobile to the beta. Legal review is still not started and now threatens the launch.",
        "key_points": [{"text": "The team has not changed the launch date yet and is waiting on legal.", "passage_ids": ["p4"]}],
        "decisions": [
            {"text": "Include the mobile app in the beta.", "type": "decision", "passage_ids": ["p2"]},
            {"text": "Hold the beta launch until legal signs off.", "type": "proposal", "passage_ids": ["p3"]}],
        "action_items": [{"description": "Chase legal about the data retention review.", "owner": None,
                          "deadline_text": "this week", "dependencies": [], "passage_ids": ["p5"]}],
        "blockers": [
            {"text": "The legal review still has not started.", "kind": "blocker", "passage_ids": ["p6"]},
            {"text": "Adding mobile to the beta needs more QA time.", "kind": "risk", "passage_ids": ["p3"]}]},
}

# One rule per new decision, in extraction order. 'match' finds the previous decision by text.
DEMO_DI = {
    "sample-2-sprint": [
        {"match": "October 15", "change_type": "revision",
         "explanation": "The beta launch date moved from October 15 to November 5.",
         "reason": "The payments vendor sandbox is delayed by three weeks.", "reason_passage_ids": ["p2"], "confidence": 0.95},
        {"match": "Postgres", "change_type": "reaffirmation",
         "explanation": "The team confirmed the earlier decision to keep Postgres.",
         "reason": None, "reason_passage_ids": [], "confidence": 0.92}],
    "sample-3-leadership": [
        {"match": "web only", "change_type": "reversal",
         "explanation": "The beta scope changed from web only to including the mobile app.",
         "reason": None, "reason_passage_ids": [], "confidence": 0.88},
        {"match": "November 5", "change_type": "needs_review",
         "explanation": "A tentative suggestion to hold the launch until legal signs off may conflict with the "
                        "November 5 date, but it was not agreed and the date was left unchanged.",
         "reason": None, "reason_passage_ids": [], "confidence": 0.5}],
}


def find_sample(sample_id):
    return next((s for s in SAMPLES if s["id"] == sample_id), None)


def demo_analyst_output(sample_id):
    return DEMO_ANALYST[sample_id]


def demo_di_output(sample_id, context):
    new, prev = context.get("new_decisions", []), context.get("previous_decisions", [])
    results = []
    for i, rule in enumerate(DEMO_DI.get(sample_id, [])):
        if i >= len(new):
            break
        p = next((c for c in prev if rule["match"].lower() in c["text"].lower()), None)
        results.append({"new_decision_id": new[i]["id"], "change_type": rule["change_type"],
                        "previous_decision_id": p["id"] if p else None, "explanation": rule["explanation"],
                        "reason": rule["reason"], "reason_passage_ids": rule["reason_passage_ids"],
                        "confidence": rule["confidence"]})
    return {"results": results}
