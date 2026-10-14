import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ListChecks, AlertTriangle, User, Calendar, Flag } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { FlagBadge } from '../components/ui/Badge';
import { EvidencePanel } from '../components/ui/EvidencePanel';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { clsx } from 'clsx';
import * as api from '../lib/api';

export default function TrackerPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.getAccountability()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingState message="Loading action tracker..." />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data?.items?.length) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No action items found"
        description="Analyze some meetings first to see action items and accountability tracking."
      />
    );
  }

  const flagged = data.items.filter(i => i.flags?.length > 0);
  const clean = data.items.filter(i => !i.flags || i.flags.length === 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <p className="text-sm text-text-secondary">{data.summary}</p>
      </Card>

      {/* Flagged Issues */}
      {flagged.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="text-accent-rose" />
            Issues ({flagged.length})
          </h2>
          <div className="space-y-3">
            {flagged.map(item => (
              <TrackerIssueCard key={item.action_id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Clean Items */}
      {clean.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <ListChecks size={15} className="text-accent-emerald" />
            Open Items ({clean.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-primary">
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Action</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Owner</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Deadline</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Meeting</th>
                </tr>
              </thead>
              <tbody>
                {clean.map(item => (
                  <tr key={item.action_id} className="border-b border-border-primary/50">
                    <td className="py-2.5 px-3 text-text-secondary">{item.description}</td>
                    <td className="py-2.5 px-3">
                      {item.owner ? (
                        <span className="text-text-secondary flex items-center gap-1">
                          <User size={11} />
                          {item.owner}
                        </span>
                      ) : (
                        <span className="text-accent-amber/70 italic">unassigned</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {item.deadline_text ? (
                        <span className="text-text-secondary flex items-center gap-1">
                          <Calendar size={11} />
                          {item.deadline_text}
                        </span>
                      ) : (
                        <span className="text-text-muted italic">none</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-text-muted">{item.meeting_title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function TrackerIssueCard({ item }) {
  const borderColor = item.flags?.includes('overdue') ? 'border-l-accent-rose' :
    item.flags?.includes('missing_owner') ? 'border-l-orange-500' :
    item.flags?.includes('duplicate') ? 'border-l-accent-amber' :
    'border-l-accent-violet';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'rounded-lg border border-border-primary bg-bg-card p-4 border-l-[3px]',
        borderColor
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {item.flags?.map(f => <FlagBadge key={f} flag={f} />)}
        <span className="text-[11px] text-text-muted">
          {item.meeting_title} · {item.meeting_date}
        </span>
      </div>
      <p className="text-sm text-text-primary">{item.description}</p>
      <div className="flex flex-wrap gap-4 mt-2 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <User size={11} />
          {item.owner || <span className="text-accent-amber/70 italic">unassigned</span>}
        </span>
        <span className="flex items-center gap-1">
          <Calendar size={11} />
          {item.deadline_text || <span className="italic">no deadline</span>}
        </span>
      </div>
      {item.notes && (
        <p className="text-xs text-text-secondary mt-2">{item.notes}</p>
      )}
      {item.duplicate_of_id && (
        <p className="text-xs text-text-muted mt-1">Duplicate of {item.duplicate_of_id}</p>
      )}
      <EvidencePanel evidence={item.evidence} />
    </motion.div>
  );
}
