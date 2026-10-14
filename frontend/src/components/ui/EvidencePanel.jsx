import { useState } from 'react';
import { ChevronDown, User, Clock, Hash } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

export function EvidencePanel({ evidence, label = 'Evidence' }) {
  const [open, setOpen] = useState(false);

  if (!evidence || evidence.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-text-muted hover:text-text-secondary transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          size={14}
          className={clsx('transition-transform duration-200', open && 'rotate-180')}
        />
        {label} ({evidence.length})
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {evidence.map((e, i) => (
                <EvidenceItem key={e.passage_id || i} item={e} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EvidenceItem({ item }) {
  return (
    <div className="rounded-lg border border-border-primary bg-bg-primary/50 p-3 text-xs">
      <div className="flex items-center gap-3 mb-1.5 text-text-muted">
        <span className="flex items-center gap-1">
          <User size={11} />
          <span className="text-text-secondary font-medium">{item.speaker || 'Unknown'}</span>
        </span>
        {item.timestamp && (
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {item.timestamp}
          </span>
        )}
        {item.passage_id && (
          <span className="flex items-center gap-1">
            <Hash size={11} />
            {item.passage_id}
          </span>
        )}
      </div>
      <p className="text-text-secondary leading-relaxed">{item.text}</p>
    </div>
  );
}
