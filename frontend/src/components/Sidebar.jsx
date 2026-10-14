import { NavLink, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FileSearch,
  GitCompareArrows,
  ListChecks,
  MessageCircleQuestion,
  Settings,
  ChevronLeft,
  Brain,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/analyze', icon: FileSearch, label: 'Analyze Meeting' },
  { to: '/decisions', icon: GitCompareArrows, label: 'Decision Intelligence' },
  { to: '/tracker', icon: ListChecks, label: 'Action Tracker' },
  { to: '/ask', icon: MessageCircleQuestion, label: 'Ask Your Meetings' },
];

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const location = useLocation();
  const { isDemo, modelName } = useApp();

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={clsx('flex items-center gap-3 px-4 py-5', collapsed && 'justify-center px-2')}>
        <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-accent-indigo to-accent-violet shadow-lg shadow-accent-indigo/20 shrink-0">
          <Brain size={18} className="text-white" />
          <Sparkles size={10} className="text-accent-cyan absolute -top-1 -right-1" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden"
            >
              <h1 className="text-base font-bold text-text-primary whitespace-nowrap tracking-tight">
                MeetMind<span className="text-accent-indigo"> AI</span>
              </h1>
              <p className="text-[10px] text-text-muted leading-none whitespace-nowrap">
                Decision Intelligence
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onMobileClose}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-accent-indigo/10 text-accent-indigo border border-accent-indigo/15'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary border border-transparent',
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className={isActive ? 'text-accent-indigo' : ''} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      {!collapsed && (
        <div className="px-3 py-3 border-t border-border-primary">
          <div className={clsx(
            'px-3 py-2 rounded-lg text-[11px]',
            isDemo
              ? 'bg-accent-amber/10 border border-accent-amber/20 text-accent-amber'
              : 'bg-accent-emerald/10 border border-accent-emerald/20 text-accent-emerald'
          )}>
            <div className="font-semibold">{isDemo ? 'Demo Mode' : 'Live Mode'}</div>
            <div className="opacity-75 mt-0.5">
              {isDemo ? 'No API key set' : modelName || 'Groq'}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 256 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={clsx(
          'hidden lg:flex flex-col fixed top-0 left-0 h-screen z-30',
          'bg-bg-sidebar border-r border-border-primary',
        )}
      >
        {sidebarContent}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-7 w-6 h-6 rounded-full bg-bg-secondary border border-border-primary flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft size={12} className={clsx('transition-transform', collapsed && 'rotate-180')} />
        </button>
      </motion.aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              onClick={onMobileClose}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 h-screen w-64 z-50 flex flex-col bg-bg-sidebar border-r border-border-primary lg:hidden"
            >
              <button
                onClick={onMobileClose}
                className="absolute top-4 right-3 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
