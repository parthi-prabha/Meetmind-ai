"""Deterministic transcript parsing. The raw transcript is stored untouched; passages are derived from it."""
import re

_TS = r"\d{1,2}:\d{2}(?::\d{2})?"
_SPK = r"[A-Z][\w.'\-]*(?: [\w.'\-]+){0,3}"
_RE_TS_FIRST = re.compile(rf"^\[?\(?({_TS})\)?\]?\s*(?:({_SPK})\s*:\s+)?(.*)$")
_RE_SPK_TS = re.compile(rf"^({_SPK})\s*[\[(]({_TS})[\])]\s*:\s*(.*)$")
_RE_SPK = re.compile(rf"^({_SPK})\s*:\s+(.*)$")


def parse_transcript(raw):
    """Return one passage per non-empty line: {local_id, idx, speaker, timestamp, text, raw}.

    Supported line shapes: '[00:01:05] Alice: text', 'Alice (00:01:05): text', 'Alice: text', plain text.
    """
    passages = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        speaker = ts = None
        text = line
        m = _RE_TS_FIRST.match(line)
        if m:
            ts, speaker, text = m.group(1), m.group(2), m.group(3)
        else:
            m = _RE_SPK_TS.match(line)
            if m:
                speaker, ts, text = m.group(1), m.group(2), m.group(3)
            else:
                m = _RE_SPK.match(line)
                if m:
                    speaker, text = m.group(1), m.group(2)
        text = text.strip()
        if not text:
            continue
        n = len(passages) + 1
        passages.append({"local_id": f"p{n}", "idx": n, "speaker": speaker, "timestamp": ts, "text": text, "raw": line})
    return passages
