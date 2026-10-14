import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export function Button({ children, className, variant = 'primary', size = 'md', loading = false, disabled = false, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-all duration-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-accent-primary text-bg-primary shadow-sm hover:brightness-110 active:brightness-95',
    secondary: 'bg-bg-secondary text-text-primary border border-border-primary hover:bg-bg-card-hover hover:border-border-secondary',
    ghost: 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
    danger: 'bg-accent-rose/10 text-accent-rose border border-accent-rose/25 hover:bg-accent-rose/20',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-sm px-6 py-2.5',
  };

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
