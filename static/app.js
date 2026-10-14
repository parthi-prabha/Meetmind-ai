"use strict";
const $ = (id) => document.getElementById(id);
const LABEL = { new: "New", reaffirmation: "Reaffirmed", revision: "Revised", reversal: "Reversed",
  possible_contradiction: "Possible contradiction", needs_review: "Needs review" };
const KIND = { blocker: "Blocker", risk: "Risk", open_question: "Open question" };
const STEP_ICON = { pending: "○", running: "◐", done: "✓", skipped: "–", error: "✕" };
let samples = [], sampleId = null, mode = "demo", busy = false;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function api(path, opts) {
  const r = await fetch(path, opts);
  let data = null;
  try { data = await r.json(); } catch (_) { /* non-JSON */ }
  if (!r.ok) {
    const e = (data && data.error) || { message: `Request failed (${r.status})` };
    throw Object.assign(new Error(e.message), { detail: e });
  }
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- evidence ---------- */
function evidence(list, label = "Evidence") {
  if (!list || !list.length) return `<p class="muted">No evidence passages.</p>`;
  const items = list.map((e) => `<div class="ev"><span class="who">${esc(e.speaker || "Unknown speaker")}</span>${e.timestamp ? ` · ${esc(e.timestamp)}` : ""}
    <span class="pid">${esc(e.passage_id)}</span><p>${esc(e.text)}</p></div>`).join("");
  return `<details><summary>${esc(label)} (${list.length})</summary>${items}</details>`;
}

/* ---------- agent status ---------- */
function renderSteps(trace) {
  $("steps").innerHTML = (trace || []).map((s) => `<li class="st-${s.status}">
    <span class="ic" aria-hidden="true">${STEP_ICON[s.status]}</span>
    <span>${esc(s.label)} <span class="kind">${s.kind === "llm" ? "LLM" : "code"}</span><span class="sr-only"> ${esc(s.status)}</span></span>
    <span class="kind">${s.ms != null ? s.ms + " ms" : esc(s.status)}</span>
    ${s.detail ? `<span class="detail">${esc(s.detail)}</span>` : ""}</li>`).join("");
}
const IDLE_STEPS = ["Parse transcript", "Meeting Analyst Agent", "Validate and save extraction",
  "Retrieve decision history", "Decision Intelligence Agent", "Persist decision history", "Accountability Agent"];
function idleSteps() {
  renderSteps(IDLE_STEPS.map((label) => ({ label, kind: /Agent/.test(label) ? "llm" : "code", status: "pending", detail: "" })));
}

/* ---------- results ---------- */
function decisionCard(d) {
  const c = d.change, type = c ? c.change_type : "new", prev = c && c.previous_decision;
  let h = `<article class="decision rail-${type}"><div class="d-head">
    <span class="badge b-${type}">${LABEL[type]}</span>
    ${d.kind === "proposal" ? `<span class="badge b-prop">Proposal, not agreed</span>` : ""}
    ${c && c.needs_review && type !== "needs_review" ? `<span class="badge b-review">Needs review</span>` : ""}</div>
    <p class="d-text">${esc(d.text)}</p>`;
  if (prev) h += `<div class="was"><span class="lbl">${prev.status === "superseded" ? "Previously" : "Compared with"}, ${esc(prev.meeting_title)} (${esc(prev.meeting_date)})${prev.status === "superseded" ? ", superseded" : ", still in effect"}</span>
    <p class="${prev.status === "superseded" ? "old" : "cmp"}">${esc(prev.text)}</p></div>`;
  if (c && type !== "new") {
    h += `<p class="why">${esc(c.explanation)}</p>`;
    if (c.reason) h += `<p class="reason"><b>Stated reason:</b> ${esc(c.reason)}</p>`;
    else if (type === "revision" || type === "reversal") h += `<p class="muted">No reason was stated in the transcript.</p>`;
    h += `<span class="conf">Confidence ${Math.round(c.confidence * 100)}%</span>`;
    if (c.reason && c.reason_evidence.length) h += evidence(c.reason_evidence, "Evidence for the reason");
  }
  h += evidence(d.evidence, "Evidence for this decision");
  if (prev) h += evidence(prev.evidence, "Evidence for the previous decision");
  return h + "</article>";
}

function renderResult(r) {
  const m = r.meeting;
  let h = `<h2>${esc(m.title)}</h2><p class="meta">${esc(m.date)} · ${m.passage_count} passages · analyzed by ${esc(m.model)}${m.mode === "demo" ? " (demo mode: pre-written output)" : ""}</p>`;
  (r.errors || []).forEach((e) => { h += `<div class="notice"><b>Partial result: ${esc(e.stage)} failed</b>${esc(e.message)}${e.hint ? `<br>${esc(e.hint)}` : ""}</div>`; });
  if (r.summary) h += `<p class="summary">${esc(r.summary)}</p>`;

  h += `<div class="section"><h3>Decisions and proposals (${r.decisions.length})</h3>`;
  h += r.decisions.length ? r.decisions.map(decisionCard).join("") : `<p class="empty">No decisions were found in this meeting.</p>`;
  h += `</div><div class="section"><h3>Action items (${r.action_items.length})</h3>`;
  if (r.action_items.length) {
    h += `<table><thead><tr><th>Action</th><th>Owner</th><th>Deadline</th></tr></thead><tbody>` + r.action_items.map((a) => `<tr>
      <td>${esc(a.description)}${a.dependencies.length ? `<br><span class="muted">Depends on: ${esc(a.dependencies.join("; "))}</span>` : ""}${evidence(a.evidence)}</td>
      <td>${a.owner ? esc(a.owner) : `<span class="unknown">unknown</span>`}</td>
      <td>${a.deadline_text ? esc(a.deadline_text) : `<span class="unknown">unknown</span>`}</td></tr>`).join("") + `</tbody></table>`;
  } else h += `<p class="empty">No action items.</p>`;
  h += `</div><div class="section"><h3>Blockers, risks and open questions (${r.blockers.length})</h3>`;
  h += r.blockers.length ? `<ul class="plain">` + r.blockers.map((b) => `<li><span class="kindtag kind-${b.kind}">${KIND[b.kind]}</span>${esc(b.text)}${evidence(b.evidence)}</li>`).join("") + `</ul>` : `<p class="empty">None found.</p>`;
  if (r.key_points.length) {
    h += `</div><div class="section"><h3>Key points</h3><ul class="plain">` + r.key_points.map((k) => `<li>${esc(k.text)}${evidence(k.evidence)}</li>`).join("") + `</ul>`;
  }
  h += `</div>`;
  if (r.warnings && r.warnings.length) {
    h += `<div class="section"><h3>Validation notes</h3><ul class="plain warn">` + r.warnings.map((w) => `<li>${esc(w)}</li>`).join("") + `</ul></div>`;
  }
  $("result").innerHTML = h;
}

async function loadHistory() {
  const data = await api("/api/history");
  let h = `<h2>Decision history</h2>`;
  if (!data.changes.length && !data.current.length) {
    $("history").innerHTML = h + `<p class="empty">Nothing here yet. Analyze a meeting, or run the 3 samples.</p>`;
    return;
  }
  h += `<p class="meta">Changes across meetings, oldest first. Old decisions are kept, never overwritten.</p>`;
  h += data.changes.length ? data.changes.map((c) => {
    const n = c.new_decision, p = c.previous_decision;
    return `<article class="decision rail-${c.change_type}"><div class="d-head">
      <span class="badge b-${c.change_type}">${LABEL[c.change_type]}</span><span class="muted">${esc(n.meeting_title)} · ${esc(n.meeting_date)}</span></div>
      ${p ? `<div class="was"><span class="lbl">${p.status === "superseded" ? "Before" : "Compared with"}, ${esc(p.meeting_title)} (${esc(p.meeting_date)})${p.status === "superseded" ? ", superseded" : ", still in effect"}</span><p class="${p.status === "superseded" ? "old" : "cmp"}">${esc(p.text)}</p></div>` : ""}
      <p class="d-text">${esc(n.text)}</p><p class="why">${esc(c.explanation)}</p>
      ${c.reason ? `<p class="reason"><b>Stated reason:</b> ${esc(c.reason)}</p>` : ""}
      <span class="conf">Confidence ${Math.round(c.confidence * 100)}%</span>
      ${evidence(n.evidence, "Evidence (new)")}${p ? evidence(p.evidence, "Evidence (previous)") : ""}</article>`;
  }).join("") : `<p class="empty">No changes yet: every decision so far is new.</p>`;
  h += `<h3 class="cur-head">Current decisions</h3>` + (data.current.length ? `<ul class="plain">` + data.current.map((d) =>
    `<li>${esc(d.text)} <span class="muted">${esc(d.meeting_title)}, ${esc(d.meeting_date)}${d.kind === "proposal" ? " · proposal" : ""}</span></li>`).join("") + `</ul>` : `<p class="empty">None.</p>`);
  $("history").innerHTML = h;
}

/* ---------- analyze flow ---------- */
function showFormError(e) {
  const box = $("formError");
  if (!e) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<b>${esc(e.message)}</b>${e.hint ? esc(e.hint) : ""}`;
}
function setBusy(v) {
  busy = v;
  ["analyze", "runAll", "reset", "askBtn"].forEach((id) => { $(id).disabled = v; });
  $("analyze").textContent = v ? "Analyzing…" : "Analyze Meeting";
}

async function analyzeOnce(payload) {
  const { job_id } = await api("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  for (;;) {
    const job = await api(`/api/jobs/${job_id}`);
    renderSteps(job.trace);
    if (job.status === "done") return job.result;
    if (job.status === "error") throw Object.assign(new Error(job.error.message), { detail: job.error });
    await sleep(350);
  }
}

async function analyze() {
  showFormError(null);
  setBusy(true);
  idleSteps();
  $("result").innerHTML = `<p class="empty">Working… the agents are reading the transcript.</p>`;
  selectTab("result");
  try {
    const r = await analyzeOnce({ title: $("title").value, date: $("date").value, transcript: $("transcript").value, sample_id: sampleId });
    renderResult(r);
    await loadHistory();
  } catch (e) {
    $("result").innerHTML = `<p class="empty">No result. See the error under the Analyze button.</p>`;
    showFormError(e.detail || { message: e.message });
  } finally { setBusy(false); }
}

async function runAll() {
  if (!samples.length) return;
  setBusy(true);
  showFormError(null);
  try {
    await api("/api/reset", { method: "POST" });
    let last = null;
    for (const s of samples) {
      fillSample(s);
      idleSteps();
      $("result").innerHTML = `<p class="empty">Analyzing “${esc(s.title)}”…</p>`;
      last = await analyzeOnce({ title: s.title, date: s.date, transcript: s.transcript, sample_id: s.id });
    }
    renderResult(last);
    await loadHistory();
    selectTab("history");
  } catch (e) {
    showFormError(e.detail || { message: e.message });
  } finally { setBusy(false); }
}

function fillSample(s) {
  $("title").value = s.title; $("date").value = s.date; $("transcript").value = s.transcript; sampleId = s.id;
}
function selectTab(name) {
  const tabs = ["result", "history", "tracker", "ask"];
  const panels = { result: "result", history: "history", tracker: "tracker", ask: "askPanel" };
  tabs.forEach((t) => {
    $("tab-" + t).setAttribute("aria-selected", t === name);
    $(panels[t]).hidden = t !== name;
  });
}

async function init() {
  idleSteps();
  $("date").value = new Date().toISOString().slice(0, 10);
  const cfg = await api("/api/config");
  mode = cfg.mode;
  const b = $("modeBanner");
  if (mode === "demo") {
    b.className = "mode demo";
    b.textContent = "DEMO MODE: no GROQ_API_KEY set. Sample meetings return pre-written results, not model output.";
  } else b.textContent = `Groq · ${cfg.model}`;
  samples = await api("/api/samples");
  $("sampleButtons").innerHTML = samples.map((s, i) => `<button type="button" data-i="${i}">${i + 1}. ${esc(s.title)}</button>`).join(" ");
  $("sampleButtons").addEventListener("click", (e) => { const i = e.target.dataset && e.target.dataset.i; if (i != null) fillSample(samples[i]); });
  $("transcript").addEventListener("input", () => { sampleId = null; });
  $("file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $("transcript").value = await f.text(); sampleId = null;
    if (!$("title").value) $("title").value = f.name.replace(/\.[^.]+$/, "");
  });
  $("analyze").addEventListener("click", analyze);
  $("runAll").addEventListener("click", runAll);
  $("reset").addEventListener("click", async () => {
    if (!confirm("Delete all stored meetings and decision history?")) return;
    await api("/api/reset", { method: "POST" });
    $("result").innerHTML = ""; idleSteps(); await loadHistory();
  });
  $("tab-result").addEventListener("click", () => selectTab("result"));
  $("tab-history").addEventListener("click", async () => { selectTab("history"); await loadHistory(); });
  $("tab-tracker").addEventListener("click", async () => { selectTab("tracker"); await loadTracker(); });
  $("tab-ask").addEventListener("click", () => selectTab("ask"));
  $("askBtn").addEventListener("click", askQuestion);
  $("askInput").addEventListener("keydown", (e) => { if (e.key === "Enter") askQuestion(); });
  $("result").innerHTML = `<p class="empty">Pick a sample (or paste a transcript) and press Analyze Meeting. Run the samples in order to see a decision change.</p>`;
  selectTab("result");
  await loadHistory();
}

/* ---------- accountability ---------- */
const FLAG_LABEL = { missing_owner: "Missing owner", overdue: "Overdue", duplicate: "Duplicate", postponed: "Postponed" };
const FLAG_CLS = { missing_owner: "contra", overdue: "revs", duplicate: "rev", postponed: "contra" };

async function loadTracker() {
  try {
    const data = await api("/api/accountability");
    let h = `<h2>Action Tracker</h2><p class="meta">${esc(data.summary || "")}</p>`;
    if (!data.items || !data.items.length) {
      $("tracker").innerHTML = h + `<p class="empty">No action items found. Analyze some meetings first.</p>`;
      return;
    }
    const flagged = data.items.filter((i) => i.flags && i.flags.length);
    const clean = data.items.filter((i) => !i.flags || !i.flags.length);
    if (flagged.length) {
      h += `<div class="section"><h3>Issues (${flagged.length})</h3>`;
      h += flagged.map((i) => {
        const badges = (i.flags || []).map((f) => `<span class="badge b-${FLAG_CLS[f] || "review"}">${esc(FLAG_LABEL[f] || f)}</span>`).join(" ");
        return `<article class="decision rail-${i.status === "overdue" ? "reversal" : i.status === "duplicate" ? "revision" : "needs_review"}">
          <div class="d-head">${badges}<span class="muted">${esc(i.meeting_title)} · ${esc(i.meeting_date)}</span></div>
          <p class="d-text">${esc(i.description)}</p>
          <p class="meta">Owner: ${i.owner ? esc(i.owner) : '<span class="unknown">unassigned</span>'} · Deadline: ${i.deadline_text ? esc(i.deadline_text) : '<span class="unknown">none</span>'}</p>
          ${i.notes ? `<p class="why">${esc(i.notes)}</p>` : ""}
          ${i.duplicate_of_id ? `<p class="muted">Duplicate of ${esc(i.duplicate_of_id)}</p>` : ""}
          ${evidence(i.evidence)}
        </article>`;
      }).join("");
      h += `</div>`;
    }
    if (clean.length) {
      h += `<div class="section"><h3>Open items (${clean.length})</h3><table><thead><tr><th>Action</th><th>Owner</th><th>Deadline</th><th>Meeting</th></tr></thead><tbody>`;
      h += clean.map((i) => `<tr>
        <td>${esc(i.description)}</td>
        <td>${i.owner ? esc(i.owner) : '<span class="unknown">unassigned</span>'}</td>
        <td>${i.deadline_text ? esc(i.deadline_text) : '<span class="unknown">none</span>'}</td>
        <td class="muted">${esc(i.meeting_title)}</td></tr>`).join("");
      h += `</tbody></table></div>`;
    }
    $("tracker").innerHTML = h;
  } catch (e) {
    $("tracker").innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

/* ---------- ask across meetings ---------- */
async function askQuestion() {
  const q = $("askInput").value.trim();
  if (!q) return;
  const err = $("askError");
  err.hidden = true;
  $("askBtn").disabled = true;
  $("askBtn").textContent = "Thinking…";
  $("askPanel").innerHTML = `<p class="empty">Searching across meetings…</p>`;
  selectTab("ask");
  try {
    const data = await api("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
    let h = `<h2>Answer</h2>`;
    const confCls = { high: "reaff", medium: "rev", low: "contra", insufficient: "revs" };
    h += `<span class="badge b-${confCls[data.confidence] || "review"}">${esc(data.confidence)} confidence</span>`;
    h += `<p class="summary">${esc(data.answer)}</p>`;
    if (data.citations && data.citations.length) {
      h += `<div class="section"><h3>Citations (${data.citations.length})</h3>`;
      h += data.citations.map((c) => `<div class="ev">
        <span class="who">${esc(c.speaker || "Unknown")}</span>${c.timestamp ? ` · ${esc(c.timestamp)}` : ""}
        <span class="pid">${esc(c.passage_id || "")}</span>
        <span class="muted"> · ${esc(c.meeting_title || c.meeting_id)}</span>
        <p>${esc(c.text)}</p></div>`).join("");
      h += `</div>`;
    }
    $("askPanel").innerHTML = h;
  } catch (e) {
    const d = e.detail || {};
    err.hidden = false;
    err.innerHTML = `<b>${esc(e.message)}</b>${d.hint ? esc(d.hint) : ""}`;
    $("askPanel").innerHTML = `<p class="empty">Could not get an answer.</p>`;
  } finally {
    $("askBtn").disabled = false;
    $("askBtn").textContent = "Ask";
  }
}

init().catch((e) => { $("result").innerHTML = `<p class="error">Could not start: ${esc(e.message)}</p>`; });
