"""Groq client (server-side only), demo client, and a validate-and-retry helper shared by both LLM agents."""
import json
import re
import time

import requests

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODELS_DOC = "https://console.groq.com/docs/models"


class LLMError(Exception):
    pass


class AuthError(LLMError):
    pass


class ModelUnavailableError(LLMError):
    pass


class OutputError(LLMError):
    """Model produced invalid / unparseable output."""


class GroqClient:
    mode = "groq"

    def __init__(self, api_key, model, timeout=60, session=None):
        self.api_key, self.model, self.timeout = api_key, model, timeout
        self.session = session or requests.Session()

    def chat(self, messages, agent="", context=None, max_tokens=2048):
        payload = {"model": self.model, "messages": messages, "temperature": 0,
                   "max_tokens": max_tokens, "response_format": {"type": "json_object"}}
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        attempt = 0
        while True:
            attempt += 1
            try:
                r = self.session.post(GROQ_URL, headers=headers, json=payload, timeout=self.timeout)
            except requests.Timeout:
                raise LLMError("The Groq request timed out. Try again or use a shorter transcript.")
            except requests.RequestException as e:
                raise LLMError(f"Could not reach the Groq API: {e}")
            if r.status_code == 200:
                choice = r.json()["choices"][0]
                if choice.get("finish_reason") == "length":
                    raise LLMError("The model output was cut off (token limit). Try a shorter transcript.")
                return choice["message"]["content"] or ""
            try:
                err = (r.json() or {}).get("error", {}) or {}
            except ValueError:
                err = {}
            code, msg = str(err.get("code", "")), str(err.get("message", r.text[:300]))
            low = msg.lower()
            if r.status_code == 429 and attempt < 3:
                time.sleep(min(float(r.headers.get("retry-after", 2) or 2), 10))
                continue
            if r.status_code == 400 and "response_format" in low and "response_format" in payload:
                payload.pop("response_format")  # model without JSON mode: rely on prompt + validation
                continue
            if r.status_code == 401:
                raise AuthError("Groq rejected GROQ_API_KEY. Check the key in your .env file.")
            if (r.status_code == 404 or code in ("model_not_found", "model_decommissioned", "model_not_active")
                    or ("model" in low and any(w in low for w in ("decommission", "does not exist", "not found", "no access")))):
                raise ModelUnavailableError(
                    f"Groq model '{self.model}' is unavailable ({msg}). Set GROQ_MODEL in .env to a supported "
                    f"model (see {MODELS_DOC}) and restart the server.")
            if code == "json_validate_failed":
                raise OutputError(f"Groq could not produce valid JSON: {msg}")
            if r.status_code == 429:
                raise LLMError("Groq rate limit reached. Wait a moment and try again.")
            raise LLMError(f"Groq API error {r.status_code}: {msg}")


class DemoClient:
    """Returns pre-written outputs for the bundled sample meetings. Clearly NOT a model."""
    mode = "demo"
    model = "demo (pre-written sample output)"

    def __init__(self, sample_id):
        self.sample_id = sample_id

    def chat(self, messages, agent="", context=None, max_tokens=0):
        import demo_data
        if agent == "analyst":
            return json.dumps(demo_data.demo_analyst_output(self.sample_id))
        if agent == "decision_intel":
            return json.dumps(demo_data.demo_di_output(self.sample_id, context or {}))
        raise LLMError(f"Demo client has no output for agent '{agent}'.")


def parse_json(text):
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    try:
        return json.loads(t)
    except ValueError:
        a, b = t.find("{"), t.rfind("}")
        if a != -1 and b > a:
            return json.loads(t[a:b + 1])
        raise


def run_json(client, agent, system, user, validate, context=None, max_retries=2, max_tokens=2048):
    """Call the model, parse + schema-validate; on invalid output retry (limited) with the error fed back."""
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    last = None
    for _ in range(max_retries + 1):
        try:
            raw = client.chat(messages, agent=agent, context=context, max_tokens=max_tokens)
        except OutputError as e:
            last = str(e)
            continue
        try:
            return validate(parse_json(raw))
        except ValueError as e:  # JSONDecodeError and SchemaError are both ValueErrors
            last = str(e)
            messages = messages + [
                {"role": "assistant", "content": raw[:4000]},
                {"role": "user", "content": f"Your output was invalid: {e}. Return ONLY the corrected JSON object."}]
    raise OutputError(f"The {agent} agent returned invalid output after {max_retries + 1} attempts: {last}")
