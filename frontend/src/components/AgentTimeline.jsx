import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { CheckCircle, Circle, Loader2, XCircle, MinusCircle, Cpu, Code } from 'lucide-react';

const STATUS_ICON = {
  pending: Circle,
  running: Loader2,
  done: CheckCircle,
  skipped: MinusCircle,
  error: XCircle,
};

const STATUS_COLOR = {
  pending: 'text-text-muted',
  running: 'text-accent-indigo',
  done: 'text-accent-emerald',
  skipped: 'text-text-muted',
  error: 'text-accent-rose',
};

export function AgentTimeline({ steps = [] }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const Icon = STATUS_ICON[step.status] || Circle;
        const color = STATUS_COLOR[step.status] || 'text-text-muted';
        const isRunning = step.status === 'running';

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={clsx(
              'flex items-center gap-3 py-1.5 px-3 rounded-lg text-xs',
              step.status === 'running' && 'bg-accent-indigo/5 border border-accent-indigo/10',
              step.status === 'error' && 'bg-accent-rose/5 border border-accent-rose/10',
              step.status === 'done' && 'opacity-80',
              step.status === 'pending' && 'opacity-40',
            )}
          >
            <Icon
              size={14}
              className={clsx(color, isRunning && 'animate-spin')}
            />
            <span className={clsx('flex-1 font-medium', step.status === 'pending' ? 'text-text-muted' : 'text-text-secondary')}>
              {step.label}
            </span>
            <span className="flex items-center gap-1.5">
              {step.kind === 'llm' ? (
                <Cpu size={10} className="text-accent-violet" />
              ) : (
                <Code size={10} className="text-text-muted" />
              )}
              <span className="text-text-muted font-mono text-[10px]">
                {step.ms != null ? `${step.ms}ms` : step.status}
              </span>
            </span>
            {step.detail && (
              <span className="text-text-muted truncate max-w-[200px]" title={step.detail}>
                {step.detail}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
