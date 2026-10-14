import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileSearch, GitCompareArrows, ListChecks, AlertTriangle,
  TrendingUp, ArrowRight, Calendar, Sparkles, Clock,
} from 'lucide-react';
import { MetricCard } from '../components/ui/Card';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ChangeBadge } from '../components/ui/Badge';
import { LoadingState, EmptyState } from '../components/ui/States';
import * as api from '../lib/api';
import { useApp } from '../context/AppContext';

export default function OverviewPage() {
  const navigate = useNavigate();
  const { isDemo } = useApp();
  const [meetings, setMeetings] = useState(null);
  const [history, setHistory] = useState(null);
  const [accountability, setAccountability] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.getMeetings(),
      api.getHistory(),
      api.getAccountability(),
    ]).then(([m, h, a]) => {
      if (m.status === 'fulfilled') setMeetings(m.value);
      if (h.status === 'fulfilled') setHistory(h.value);
      if (a.status === 'fulfilled') setAccountability(a.value);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState message="Loading dashboard..." />;

  const meetingCount = meetings?.length || 0;
  const decisionCount = history?.current?.length || 0;
  const changeCount = history?.changes?.length || 0;
  const actionItems = accountability?.items || [];
  const flaggedCount = actionItems.filter(i => i.flags?.length > 0).length;
  const recentMeetings = (meetings || []).slice(-3).reverse();
  const recentChanges = (history?.changes || []).slice(-5).reverse();

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-border-primary bg-gradient-to-br from-accent-indigo/10 via-bg-card to-accent-violet/5 p-6 lg:p-8"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-accent-indigo/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-accent-indigo" />
            <span className="text-xs font-medium text-accent-indigo uppercase tracking-wider">
              AI-Powered Analysis
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-text-primary mb-2">
            Welcome to MeetMind AI
          </h1>
          <p className="text-sm text-text-secondary max-w-lg mb-4">
            Track decisions, analyze meeting transcripts, and never lose context on what changed and why.
            {isDemo && ' Running in demo mode — use the sample meetings to explore.'}
          </p>
          <Button onClick={() => navigate('/analyze')} size="lg">
            <FileSearch size={16} />
            Analyze a Meeting
            <ArrowRight size={14} />
          </Button>
        </div>
      </motion.div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={FileSearch}
          label="Meetings Analyzed"
          value={meetingCount}
          trend={meetingCount > 0 ? `${meetingCount} transcript${meetingCount !== 1 ? 's' : ''} processed` : 'No meetings yet'}
        />
        <MetricCard
          icon={GitCompareArrows}
          label="Active Decisions"
          value={decisionCount}
          trend={changeCount > 0 ? `${changeCount} change${changeCount !== 1 ? 's' : ''} tracked` : 'No changes yet'}
        />
        <MetricCard
          icon={ListChecks}
          label="Action Items"
          value={actionItems.length}
          trend={flaggedCount > 0 ? `${flaggedCount} flagged issue${flaggedCount !== 1 ? 's' : ''}` : 'No issues'}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Flagged Issues"
          value={flaggedCount}
          trend={flaggedCount > 0 ? 'Requires attention' : 'All clear'}
        />
      </div>

      {/* Two-column content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent meetings */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Calendar size={15} className="text-accent-indigo" />
              Recent Meetings
            </h3>
            {meetingCount > 0 && (
              <button
                onClick={() => navigate('/analyze')}
                className="text-xs text-accent-indigo hover:underline"
              >
                View all
              </button>
            )}
          </div>
          {recentMeetings.length > 0 ? (
            <div className="space-y-2">
              {recentMeetings.map(m => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-bg-primary/50 hover:bg-bg-tertiary transition-colors cursor-pointer"
                  onClick={() => navigate(`/analyze?meeting=${m.id}`)}
                >
                  <div>
                    <div className="text-sm font-medium text-text-primary">{m.title || 'Untitled'}</div>
                    <div className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5">
                      <Clock size={10} />
                      {m.date || 'No date'}
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    m.status === 'complete' ? 'bg-accent-emerald/10 text-accent-emerald' :
                    m.status === 'partial' ? 'bg-accent-amber/10 text-accent-amber' :
                    'bg-bg-tertiary text-text-muted'
                  }`}>
                    {m.status || 'pending'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileSearch}
              title="No meetings yet"
              description="Analyze your first meeting to get started"
            />
          )}
        </Card>

        {/* Recent decision changes */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <TrendingUp size={15} className="text-accent-violet" />
              Recent Decision Changes
            </h3>
            {changeCount > 0 && (
              <button
                onClick={() => navigate('/decisions')}
                className="text-xs text-accent-indigo hover:underline"
              >
                View all
              </button>
            )}
          </div>
          {recentChanges.length > 0 ? (
            <div className="space-y-2">
              {recentChanges.map(c => (
                <div
                  key={c.id}
                  className="py-2 px-3 rounded-lg bg-bg-primary/50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ChangeBadge type={c.change_type} />
                    <span className="text-[11px] text-text-muted">
                      {c.new_decision?.meeting_title}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-2">
                    {c.explanation}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={GitCompareArrows}
              title="No decision changes"
              description="Changes appear after analyzing multiple meetings"
            />
          )}
        </Card>
      </div>
    </div>
  );
}
