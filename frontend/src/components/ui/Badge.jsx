import { clsx } from 'clsx';
import { CHANGE_LABELS, BLOCKER_LABELS, FLAG_LABELS } from '../../lib/constants';

export function Badge({ children, className, variant = 'default' }) {
  const base = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap';
  const variants = {
    default: 'bg-bg-tertiary text-text-secondary border border-border-primary',
    indigo: 'bg-accent-indigo/15 text-accent-indigo border border-accent-indigo/25',
    emerald: 'bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/25',
    amber: 'bg-accent-amber/15 text-accent-amber border border-accent-amber/25',
    rose: 'bg-accent-rose/15 text-accent-rose border border-accent-rose/25',
    violet: 'bg-accent-violet/15 text-accent-violet border border-accent-violet/25',
    cyan: 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/25',
    orange: 'bg-orange-500/15 text-orange-400 border border-orange-500/25',
  };

  return (
    <span className={clsx(base, variants[variant] || variants.default, className)}>
      {children}
    </span>
  );
}

const CHANGE_VARIANT = {
  new: 'indigo',
  reaffirmation: 'emerald',
  revision: 'amber',
  reversal: 'rose',
  possible_contradiction: 'orange',
  needs_review: 'violet',
};

const BLOCKER_VARIANT = {
  blocker: 'rose',
  risk: 'amber',
  open_question: 'cyan',
};

const FLAG_VARIANT = {
  missing_owner: 'orange',
  overdue: 'rose',
  duplicate: 'amber',
  postponed: 'violet',
};

export function ChangeBadge({ type }) {
  return <Badge variant={CHANGE_VARIANT[type] || 'default'}>{CHANGE_LABELS[type] || type}</Badge>;
}

export function BlockerBadge({ kind }) {
  return <Badge variant={BLOCKER_VARIANT[kind] || 'default'}>{BLOCKER_LABELS[kind] || kind}</Badge>;
}

export function FlagBadge({ flag }) {
  return <Badge variant={FLAG_VARIANT[flag] || 'default'}>{FLAG_LABELS[flag] || flag}</Badge>;
}

export function ProposalBadge() {
  return <Badge variant="default">Proposal, not agreed</Badge>;
}

export function ConfidenceBadge({ confidence }) {
  const pct = Math.round((confidence || 0) * 100);
  let variant = 'default';
  if (pct >= 85) variant = 'emerald';
  else if (pct >= 60) variant = 'amber';
  else variant = 'rose';
  return <Badge variant={variant}>{pct}% confidence</Badge>;
}

export function ConfidenceLevelBadge({ level }) {
  const variants = { high: 'emerald', medium: 'amber', low: 'rose', insufficient: 'default' };
  return <Badge variant={variants[level] || 'default'}>{level} confidence</Badge>;
}
