const BASE = '';

async function request(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await r.json(); } catch (_) { /* non-JSON */ }
  if (!r.ok) {
    const e = (data && data.error) || { message: `Request failed (${r.status})` };
    const err = new Error(e.message);
    err.detail = e;
    throw err;
  }
  return data;
}

export async function getConfig() {
  return request('/api/config');
}

export async function getSamples() {
  return request('/api/samples');
}

export async function getHistory() {
  return request('/api/history');
}

export async function getMeetings() {
  return request('/api/meetings');
}

export async function getMeeting(id) {
  return request(`/api/meetings/${id}`);
}

export async function analyze(payload) {
  return request('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getJob(jobId) {
  return request(`/api/jobs/${jobId}`);
}

export async function resetData() {
  return request('/api/reset', { method: 'POST' });
}

export async function getAccountability() {
  return request('/api/accountability');
}

export async function askQuestion(question) {
  return request('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}

export async function pollJob(jobId, onTrace, interval = 400) {
  while (true) {
    const job = await getJob(jobId);
    if (onTrace) onTrace(job.trace);
    if (job.status === 'done') return job.result;
    if (job.status === 'error') {
      const err = new Error(job.error.message);
      err.detail = job.error;
      throw err;
    }
    await new Promise(r => setTimeout(r, interval));
  }
}
