export const CHANGE_LABELS = {
  new: 'New',
  reaffirmation: 'Reaffirmed',
  revision: 'Revised',
  reversal: 'Reversed',
  possible_contradiction: 'Contradiction',
  needs_review: 'Needs Review',
};

export const CHANGE_COLORS = {
  new: 'bg-badge-new',
  reaffirmation: 'bg-badge-reaffirmed',
  revision: 'bg-badge-revised',
  reversal: 'bg-badge-reversed',
  possible_contradiction: 'bg-badge-contradiction',
  needs_review: 'bg-badge-review',
};

export const BLOCKER_LABELS = {
  blocker: 'Blocker',
  risk: 'Risk',
  open_question: 'Open Question',
};

export const BLOCKER_COLORS = {
  blocker: 'bg-badge-blocker',
  risk: 'bg-badge-risk',
  open_question: 'bg-badge-open-question',
};

export const FLAG_LABELS = {
  missing_owner: 'Missing Owner',
  overdue: 'Overdue',
  duplicate: 'Duplicate',
  postponed: 'Postponed',
};

export const FLAG_COLORS = {
  missing_owner: 'bg-badge-contradiction',
  overdue: 'bg-badge-reversed',
  duplicate: 'bg-badge-revised',
  postponed: 'bg-badge-review',
};

export const STEP_LABELS = [
  'Parse transcript',
  'Meeting Analyst Agent',
  'Validate and save extraction',
  'Retrieve decision history',
  'Decision Intelligence Agent',
  'Persist decision history',
  'Accountability Agent',
];
