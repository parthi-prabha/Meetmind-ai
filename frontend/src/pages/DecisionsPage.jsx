import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GitCompareArrows, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { ChangeBadge, ConfidenceBadge } from '../components/ui/Badge';
import { EvidencePanel } from '../components/ui/EvidencePanel';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { clsx } from 'clsx';
import * as api from '../lib/api';

export default function DecisionsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.getHistory()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingState message="Loading decision history..." />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data || (!data.changes?.length && !data.current?.length)) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="No decision history yet"
        description="Analyze meetings to see how decisions evolve over time. Run the 3 sample meetings in order to see a complete decision change trail."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      <Card>
        <p className="text-sm text-text-secondary">
          Cross-meeting decision ledger showing how decisions evolved. Old decisions are preserved, never overwritten.
        </p>
      </Card>

      {/* Changes */}
      {data.changes?.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <GitCompareArrows size={15} className="text-accent-violet" />
            Decision Changes ({data.changes.length})
          </h2>
          <div className="space-y-3">
            {data.changes.map(c => (
              <ChangeCard key={c.id} change={c} />
            ))}
          </div>
        </div>
      )}

      {data.changes?.length === 0 && (
        <p className="text-sm text-text-muted">No changes yet: every decision so far is new.</p>
      )}

      {/* Current decisions */}
      {data.current?.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            Current Active Decisions ({data.current.length})
          </h3>
          <div className="space-y-2">
            {data.current.map(d => (
              <div key={d.id} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-bg-primary/50">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-emerald mt-1.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-text-secondary">{d.text}</p>
                  <span className="text-[11px] text-text-muted mt-0.5 block">
                    {d.meeting_title}, {d.meeting_date}
                    {d.kind === 'proposal' && ' · proposal'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ChangeCard({ change: c }) {
  const n = c.new_decision;
  const p = c.previous_decision;

  const borderColor = {
    reaffirmation: 'border-l-accent-emerald',
    revision: 'border-l-accent-amber',
    reversal: 'border-l-accent-rose',
    possible_contradiction: 'border-l-orange-500',
    needs_review: 'border-l-accent-violet',
  }[c.change_type] || 'border-l-accent-indigo';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'rounded-lg border border-border-primary bg-bg-card p-4 border-l-[3px]',
        borderColor
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ChangeBadge type={c.change_type} />
        {c.needs_review && <ChangeBadge type="needs_review" />}
        <span className="text-[11px] text-text-muted">
          {n?.meeting_title} · {n?.meeting_date}
        </span>
      </div>

      {/* Comparison view */}
      {p && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 mb-3">
          <div className="p-3 rounded-lg bg-bg-primary/50 border border-border-primary">
            <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider block mb-1">
              {p.status === 'superseded' ? 'Previous (superseded)' : 'Previous (still active)'}
            </span>
            <p className={clsx(
              'text-xs',
              p.status === 'superseded' ? 'text-text-muted line-through' : 'text-text-secondary'
            )}>
              {p.text}
            </p>
            <span className="text-[10px] text-text-muted mt-1 block">
              {p.meeting_title} ({p.meeting_date})
            </span>
            <EvidencePanel evidence={p.evidence} label="Evidence (previous)" />
          </div>

          <div className="hidden md:flex items-center">
            <ArrowRight size={16} className="text-text-muted" />
          </div>

          <div className="p-3 rounded-lg bg-bg-primary/50 border border-accent-indigo/10">
            <span className="text-[10px] text-accent-indigo font-medium uppercase tracking-wider block mb-1">
              Current
            </span>
            <p className="text-xs text-text-primary font-medium">{n?.text}</p>
            <EvidencePanel evidence={n?.evidence} label="Evidence (current)" />
          </div>
        </div>
      )}

      {!p && n && (
        <p className="text-sm text-text-primary mb-3">{n.text}</p>
      )}

      <p className="text-xs text-text-secondary">{c.explanation}</p>
      {c.reason && (
        <p className="text-xs text-text-secondary mt-1">
          <span className="font-semibold">Stated reason:</span> {c.reason}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <ConfidenceBadge confidence={c.confidence} />
      </div>
      {c.reason_evidence?.length > 0 && (
        <EvidencePanel evidence={c.reason_evidence} label="Evidence for the reason" />
      )}
    </motion.div>
  );
}
