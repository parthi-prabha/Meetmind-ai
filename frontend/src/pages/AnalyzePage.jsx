import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Upload, FileText, Sparkles, Play, RotateCcw,
  ChevronDown, AlertCircle, Clock, User, Hash,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ChangeBadge, ProposalBadge, ConfidenceBadge, BlockerBadge } from '../components/ui/Badge';
import { EvidencePanel } from '../components/ui/EvidencePanel';
import { AgentTimeline } from '../components/AgentTimeline';
import { EmptyState, ErrorState } from '../components/ui/States';
import { useApp } from '../context/AppContext';
import * as api from '../lib/api';
import { STEP_LABELS } from '../lib/constants';

function idleSteps() {
  return STEP_LABELS.map(label => ({
    label,
    kind: /Agent/.test(label) ? 'llm' : 'code',
    status: 'pending',
    detail: '',
  }));
}

export default function AnalyzePage() {
  const { samples } = useApp();
  const fileRef = useRef(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [transcript, setTranscript] = useState('');
  const [sampleId, setSampleId] = useState(null);
  const [steps, setSteps] = useState(idleSteps());
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showSamples, setShowSamples] = useState(false);

  const fillSample = useCallback((s) => {
    setTitle(s.title);
    setDate(s.date);
    setTranscript(s.transcript);
    setSampleId(s.id);
    setShowSamples(false);
    setResult(null);
    setError(null);
  }, []);

  const handleFile = useCallback(async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    setTranscript(text);
    setSampleId(null);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }, [title]);

  const analyze = useCallback(async () => {
    setError(null);
    setBusy(true);
    setSteps(idleSteps());
    setResult(null);
    try {
      const { job_id } = await api.analyze({
        title, date, transcript, sample_id: sampleId,
      });
      const res = await api.pollJob(job_id, (trace) => setSteps(trace || []));
      setResult(res);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [title, date, transcript, sampleId]);

  const runAllSamples = useCallback(async () => {
    if (!samples.length) return;
    setBusy(true);
    setError(null);
    try {
      await api.resetData();
      let last = null;
      for (const s of samples) {
        fillSample(s);
        setSteps(idleSteps());
        const { job_id } = await api.analyze({
          title: s.title, date: s.date, transcript: s.transcript, sample_id: s.id,
        });
        last = await api.pollJob(job_id, (trace) => setSteps(trace || []));
      }
      setResult(last);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [samples, fillSample]);

  const handleReset = useCallback(async () => {
    if (!confirm('Delete all stored meetings and decision history?')) return;
    try {
      await api.resetData();
      setResult(null);
      setSteps(idleSteps());
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
      {/* Left: Input panel */}
      <div className="space-y-4">
        {/* Sample selector */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <FileText size={15} className="text-accent-indigo" />
              Meeting Input
            </h3>
            <button
              onClick={() => setShowSamples(!showSamples)}
              className="text-xs text-accent-indigo hover:underline flex items-center gap-1"
            >
              Try a sample
              <ChevronDown size={12} className={clsx('transition-transform', showSamples && 'rotate-180')} />
            </button>
          </div>

          {showSamples && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="overflow-hidden mb-4"
            >
              <div className="space-y-1.5 p-3 rounded-lg bg-bg-primary/50 border border-border-primary">
                {samples.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => fillSample(s)}
                    className={clsx(
                      'w-full text-left px-3 py-2 rounded-md text-xs transition-colors',
                      sampleId === s.id
                        ? 'bg-accent-indigo/10 text-accent-indigo border border-accent-indigo/20'
                        : 'text-text-secondary hover:bg-bg-tertiary'
                    )}
                  >
                    <span className="font-medium">{i + 1}. {s.title}</span>
                    <span className="text-text-muted ml-2">{s.date}</span>
                  </button>
                ))}
                <div className="pt-2 border-t border-border-primary flex gap-2">
                  <Button size="sm" variant="secondary" onClick={runAllSamples} disabled={busy}>
                    <Play size={12} />
                    Run all 3 samples
                  </Button>
                  <Button size="sm" variant="danger" onClick={handleReset} disabled={busy}>
                    <RotateCcw size={12} />
                    Reset
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Form fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1" htmlFor="meeting-title">Title</label>
              <input
                id="meeting-title"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Weekly product sync"
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-primary text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent-indigo focus:ring-1 focus:ring-accent-indigo/30 transition-colors outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1" htmlFor="meeting-date">Date</label>
              <input
                id="meeting-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-primary text-sm text-text-primary focus:border-accent-indigo focus:ring-1 focus:ring-accent-indigo/30 transition-colors outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1" htmlFor="meeting-transcript">Transcript</label>
              <textarea
                id="meeting-transcript"
                value={transcript}
                onChange={e => { setTranscript(e.target.value); setSampleId(null); }}
                placeholder={'[00:01:05] Alice: We will launch on Friday.\n[00:01:40] Bob: I\'ll draft the announcement by Wednesday.'}
                rows={10}
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-primary text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent-indigo focus:ring-1 focus:ring-accent-indigo/30 transition-colors outline-none resize-y font-mono text-xs leading-relaxed"
              />
            </div>
            <div>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border-secondary text-xs text-text-muted hover:text-text-secondary hover:border-accent-indigo/30 hover:bg-accent-indigo/5 transition-colors w-full justify-center"
              >
                <Upload size={14} />
                Upload .txt, .md, .vtt, or .srt file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.vtt,.srt,text/plain"
                onChange={handleFile}
                className="hidden"
                aria-label="Upload transcript file"
              />
            </div>
          </div>

          <Button
            className="w-full mt-4"
            onClick={analyze}
            loading={busy}
            disabled={!transcript.trim()}
            size="lg"
          >
            <Sparkles size={16} />
            {busy ? 'Analyzing…' : 'Analyze Meeting'}
          </Button>

          {error && (
            <div className="mt-3 p-3 rounded-lg bg-accent-rose/10 border border-accent-rose/20 text-xs text-accent-rose">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{error.message}</p>
                  {error.detail?.hint && <p className="mt-1 opacity-75">{error.detail.hint}</p>}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Agent timeline */}
        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Sparkles size={15} className="text-accent-violet" />
            Agent Pipeline
          </h3>
          <AgentTimeline steps={steps} />
        </Card>
      </div>

      {/* Right: Results */}
      <div className="space-y-4">
        {result ? <AnalysisResult result={result} /> : (
          <EmptyState
            icon={FileText}
            title="No analysis yet"
            description="Pick a sample or paste a transcript and press Analyze Meeting. Run the samples in order to see decision changes."
          />
        )}
      </div>
    </div>
  );
}

function AnalysisResult({ result }) {
  const m = result.meeting;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Header */}
      <Card>
        <h2 className="text-lg font-bold text-text-primary">{m.title || 'Meeting Analysis'}</h2>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-text-muted">
          <span className="flex items-center gap-1"><Clock size={12} />{m.date || 'No date'}</span>
          <span>{m.passage_count} passages</span>
          <span>Analyzed by {m.model}{m.mode === 'demo' ? ' (demo)' : ''}</span>
        </div>
        {result.summary && (
          <p className="mt-3 text-sm text-text-secondary leading-relaxed">{result.summary}</p>
        )}
      </Card>

      {/* Errors/warnings */}
      {result.errors?.map((e, i) => (
        <div key={i} className="p-3 rounded-lg bg-accent-rose/10 border border-accent-rose/20 text-xs">
          <p className="font-semibold text-accent-rose">Partial result: {e.stage} failed</p>
          <p className="text-text-secondary mt-1">{e.message}</p>
          {e.hint && <p className="text-text-muted mt-1">{e.hint}</p>}
        </div>
      ))}

      {/* Decisions */}
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-3">
          Decisions & Proposals ({result.decisions?.length || 0})
        </h3>
        {result.decisions?.length > 0 ? (
          <div className="space-y-3">
            {result.decisions.map(d => (
              <DecisionCard key={d.id} decision={d} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No decisions were found in this meeting.</p>
        )}
      </Card>

      {/* Action Items */}
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-3">
          Action Items ({result.action_items?.length || 0})
        </h3>
        {result.action_items?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-primary">
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Action</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Owner</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {result.action_items.map(a => (
                  <tr key={a.id} className="border-b border-border-primary/50">
                    <td className="py-2.5 px-3 text-text-secondary">
                      {a.description}
                      {a.dependencies?.length > 0 && (
                        <span className="block text-text-muted mt-0.5">
                          Depends on: {a.dependencies.join('; ')}
                        </span>
                      )}
                      <EvidencePanel evidence={a.evidence} />
                    </td>
                    <td className="py-2.5 px-3">
                      {a.owner ? (
                        <span className="text-text-secondary">{a.owner}</span>
                      ) : (
                        <span className="text-accent-amber/70 italic">unassigned</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {a.deadline_text ? (
                        <span className="text-text-secondary">{a.deadline_text}</span>
                      ) : (
                        <span className="text-text-muted italic">none</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-text-muted">No action items.</p>
        )}
      </Card>

      {/* Blockers */}
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-3">
          Blockers, Risks & Open Questions ({result.blockers?.length || 0})
        </h3>
        {result.blockers?.length > 0 ? (
          <div className="space-y-2">
            {result.blockers.map(b => (
              <div key={b.id} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-bg-primary/50">
                <BlockerBadge kind={b.kind} />
                <div className="flex-1">
                  <p className="text-xs text-text-secondary">{b.text}</p>
                  <EvidencePanel evidence={b.evidence} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">None found.</p>
        )}
      </Card>

      {/* Key Points */}
      {result.key_points?.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Key Points</h3>
          <div className="space-y-2">
            {result.key_points.map(kp => (
              <div key={kp.id} className="py-2 px-3 rounded-lg bg-bg-primary/50">
                <p className="text-xs text-text-secondary">{kp.text}</p>
                <EvidencePanel evidence={kp.evidence} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Warnings */}
      {result.warnings?.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Validation Notes</h3>
          <ul className="space-y-1">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs text-accent-amber flex items-start gap-2 py-1">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                {w}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </motion.div>
  );
}

function DecisionCard({ decision: d }) {
  const c = d.change;
  const type = c ? c.change_type : 'new';
  const prev = c?.previous_decision;

  const borderColor = {
    new: 'border-l-accent-indigo',
    reaffirmation: 'border-l-accent-emerald',
    revision: 'border-l-accent-amber',
    reversal: 'border-l-accent-rose',
    possible_contradiction: 'border-l-orange-500',
    needs_review: 'border-l-accent-violet',
  }[type] || 'border-l-border-primary';

  return (
    <div className={clsx('rounded-lg border border-border-primary bg-bg-primary/50 p-4 border-l-[3px]', borderColor)}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <ChangeBadge type={type} />
        {d.kind === 'proposal' && <ProposalBadge />}
        {c?.needs_review && type !== 'needs_review' && (
          <ChangeBadge type="needs_review" />
        )}
      </div>
      <p className="text-sm text-text-primary leading-relaxed">{d.text}</p>

      {prev && (
        <div className="mt-3 p-3 rounded-md bg-bg-tertiary/50 border border-border-primary">
          <span className="text-[11px] text-text-muted">
            {prev.status === 'superseded' ? 'Previously' : 'Compared with'}, {prev.meeting_title} ({prev.meeting_date})
            {prev.status === 'superseded' ? ', superseded' : ', still in effect'}
          </span>
          <p className={clsx('text-xs mt-1', prev.status === 'superseded' ? 'text-text-muted line-through' : 'text-text-secondary')}>
            {prev.text}
          </p>
          <EvidencePanel evidence={prev.evidence} label="Evidence (previous)" />
        </div>
      )}

      {c && type !== 'new' && (
        <div className="mt-2">
          <p className="text-xs text-text-secondary">{c.explanation}</p>
          {c.reason ? (
            <p className="text-xs text-text-secondary mt-1">
              <span className="font-semibold">Stated reason:</span> {c.reason}
            </p>
          ) : (type === 'revision' || type === 'reversal') ? (
            <p className="text-xs text-text-muted mt-1 italic">No reason was stated in the transcript.</p>
          ) : null}
          <div className="mt-2">
            <ConfidenceBadge confidence={c.confidence} />
          </div>
          {c.reason && c.reason_evidence?.length > 0 && (
            <EvidencePanel evidence={c.reason_evidence} label="Evidence for the reason" />
          )}
        </div>
      )}

      <EvidencePanel evidence={d.evidence} label="Evidence for this decision" />
    </div>
  );
}
