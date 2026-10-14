"""Structural schema validation for LLM output (no external dependency). Raises SchemaError (a ValueError)."""

DECISION_TYPES = ("decision", "proposal")
BLOCKER_KINDS = ("blocker", "risk", "open_question")
CHANGE_TYPES = ("new", "reaffirmation", "revision", "reversal", "possible_contradiction", "needs_review")


class SchemaError(ValueError):
    pass


def _list(d, key):
    v = d.get(key, [])
    if v is None:
        return []
    if not isinstance(v, list):
        raise SchemaError(f"'{key}' must be a list")
    return v


def _str(item, key, where, required=True):
    v = item.get(key)
    if v is None and not required:
        return None
    if not isinstance(v, str) or (required and not v.strip()):
        raise SchemaError(f"{where}.{key} must be a non-empty string" if required else f"{where}.{key} must be a string or null")
    return v.strip()


def _ids(item, key, where):
    v = item.get(key, [])
    if v is None:
        v = []
    if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
        raise SchemaError(f"{where}.{key} must be a list of strings")
    return v


def validate_analyst_output(raw):
    if not isinstance(raw, dict):
        raise SchemaError("top level must be a JSON object")
    out = {"summary": raw.get("summary") if isinstance(raw.get("summary"), str) else "",
           "key_points": [], "decisions": [], "action_items": [], "blockers": []}
    for i, it in enumerate(_list(raw, "key_points")):
        w = f"key_points[{i}]"
        if not isinstance(it, dict):
            raise SchemaError(f"{w} must be an object")
        out["key_points"].append({"text": _str(it, "text", w), "passage_ids": _ids(it, "passage_ids", w)})
    for i, it in enumerate(_list(raw, "decisions")):
        w = f"decisions[{i}]"
        if not isinstance(it, dict):
            raise SchemaError(f"{w} must be an object")
        t = it.get("type", "decision")
        if t not in DECISION_TYPES:
            raise SchemaError(f"{w}.type must be one of {DECISION_TYPES}")
        out["decisions"].append({"text": _str(it, "text", w), "kind": t, "passage_ids": _ids(it, "passage_ids", w)})
    for i, it in enumerate(_list(raw, "action_items")):
        w = f"action_items[{i}]"
        if not isinstance(it, dict):
            raise SchemaError(f"{w} must be an object")
        deps = it.get("dependencies", [])
        if deps is None:
            deps = []
        if not isinstance(deps, list) or not all(isinstance(x, str) for x in deps):
            raise SchemaError(f"{w}.dependencies must be a list of strings")
        out["action_items"].append({
            "description": _str(it, "description", w), "owner": _str(it, "owner", w, required=False),
            "deadline_text": _str(it, "deadline_text", w, required=False), "dependencies": deps,
            "passage_ids": _ids(it, "passage_ids", w)})
    for i, it in enumerate(_list(raw, "blockers")):
        w = f"blockers[{i}]"
        if not isinstance(it, dict):
            raise SchemaError(f"{w} must be an object")
        k = it.get("kind", "blocker")
        if k not in BLOCKER_KINDS:
            raise SchemaError(f"{w}.kind must be one of {BLOCKER_KINDS}")
        out["blockers"].append({"text": _str(it, "text", w), "kind": k, "passage_ids": _ids(it, "passage_ids", w)})
    return out


def validate_di_output(raw, new_ids, cand_ids):
    if not isinstance(raw, dict) or not isinstance(raw.get("results"), list):
        raise SchemaError("top level must be an object with a 'results' list")
    out, seen = [], set()
    for i, it in enumerate(raw["results"]):
        w = f"results[{i}]"
        if not isinstance(it, dict):
            raise SchemaError(f"{w} must be an object")
        nid = it.get("new_decision_id")
        if nid not in new_ids:
            raise SchemaError(f"{w}.new_decision_id '{nid}' is not one of {sorted(new_ids)}")
        ct = it.get("change_type")
        if ct not in CHANGE_TYPES:
            raise SchemaError(f"{w}.change_type must be one of {CHANGE_TYPES}")
        prev = it.get("previous_decision_id")
        if prev is not None and prev not in cand_ids:
            raise SchemaError(f"{w}.previous_decision_id '{prev}' is not one of the provided previous decisions")
        conf = it.get("confidence")
        if isinstance(conf, bool) or not isinstance(conf, (int, float)):
            raise SchemaError(f"{w}.confidence must be a number between 0 and 1")
        if 1 < conf <= 100:
            conf = conf / 100.0
        if not 0 <= conf <= 1:
            raise SchemaError(f"{w}.confidence must be between 0 and 1")
        reason = it.get("reason")
        if reason is not None and not isinstance(reason, str):
            raise SchemaError(f"{w}.reason must be a string or null")
        expl = it.get("explanation")
        if not isinstance(expl, str):
            raise SchemaError(f"{w}.explanation must be a string")
        if nid in seen:
            continue
        seen.add(nid)
        out.append({"new_decision_id": nid, "change_type": ct, "previous_decision_id": prev,
                    "explanation": expl.strip(), "reason": (reason or "").strip() or None,
                    "reason_passage_ids": _ids(it, "reason_passage_ids", w), "confidence": float(conf)})
    return out
