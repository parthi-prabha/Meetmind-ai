import { motion } from 'framer-motion';
import { Loader2, AlertTriangle } from 'lucide-react';

export function LoadingState({ message = 'Loading...' }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-20"
    >
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-border-primary" />
        <Loader2 size={48} className="absolute inset-0 text-accent-indigo animate-spin" />
      </div>
      <p className="mt-4 text-sm text-text-muted">{message}</p>
    </motion.div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      {Icon && (
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-bg-tertiary border border-border-primary mb-4">
          <Icon size={24} className="text-text-muted" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-text-primary mb-1">{title}</h3>
      {description && <p className="text-sm text-text-muted max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

export function ErrorState({ error, onRetry }) {
  const message = typeof error === 'string' ? error : error?.message || 'Something went wrong';
  const hint = error?.detail?.hint || error?.hint;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-rose/10 border border-accent-rose/20 mb-4">
        <AlertTriangle size={24} className="text-accent-rose" />
      </div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">Error</h3>
      <p className="text-sm text-text-muted max-w-md">{message}</p>
      {hint && <p className="text-xs text-text-muted mt-1 max-w-md">{hint}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-xs font-medium text-accent-indigo hover:underline"
        >
          Try again
        </button>
      )}
    </motion.div>
  );
}
