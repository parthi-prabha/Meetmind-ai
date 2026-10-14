import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export function Card({ children, className, hover = false, ...props }) {
  const Component = hover ? motion.div : 'div';
  const hoverProps = hover ? {
    whileHover: { backgroundColor: 'var(--color-bg-card-hover)', borderColor: 'var(--color-border-secondary)' },
    transition: { duration: 0.2 },
  } : {};

  return (
    <Component
      className={clsx(
        'rounded-xl border border-border-primary bg-bg-card p-5',
        'transition-colors duration-200',
        hover && 'cursor-pointer hover:border-border-secondary hover:bg-bg-card-hover',
        className
      )}
      {...hoverProps}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ children, className }) {
  return (
    <div className={clsx('flex items-center justify-between mb-3', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }) {
  return (
    <h3 className={clsx('text-sm font-semibold text-text-primary', className)}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className }) {
  return (
    <div className={clsx('text-sm text-text-secondary', className)}>
      {children}
    </div>
  );
}

export function MetricCard({ icon: Icon, label, value, trend, className }) {
  return (
    <Card className={clsx('relative overflow-hidden', className)}>
      <div className="absolute top-0 right-0 w-24 h-24 opacity-5">
        {Icon && <Icon size={96} />}
      </div>
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          {Icon && (
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-indigo/10">
              <Icon size={16} className="text-accent-indigo" />
            </div>
          )}
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-2xl font-bold text-text-primary">{value}</div>
        {trend && (
          <div className="text-xs text-text-muted mt-1">{trend}</div>
        )}
      </div>
    </Card>
  );
}
