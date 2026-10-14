import { useLocation } from 'react-router-dom';
import { Menu, Sun, Moon, Monitor } from 'lucide-react';
import { clsx } from 'clsx';
import { useApp } from '../context/AppContext';

const TITLES = {
  '/': 'Overview',
  '/analyze': 'Analyze Meeting',
  '/decisions': 'Decision Intelligence',
  '/tracker': 'Action Tracker',
  '/ask': 'Ask Your Meetings',
};

export function TopBar({ onMobileMenuOpen }) {
  const location = useLocation();
  const { theme, setTheme, isDemo, modelName } = useApp();

  const title = TITLES[location.pathname] || 'MeetMind AI';

  const themeIcons = {
    dark: Moon,
    light: Sun,
    system: Monitor,
  };
  const ThemeIcon = themeIcons[theme] || Moon;
  const nextTheme = { dark: 'light', light: 'system', system: 'dark' };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between h-14 px-4 lg:px-6 bg-bg-primary/80 backdrop-blur-xl border-b border-border-primary">
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuOpen}
          className="lg:hidden p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Mode badge */}
        <div className={clsx(
          'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium',
          isDemo
            ? 'bg-accent-amber/10 text-accent-amber border border-accent-amber/20'
            : 'bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20'
        )}>
          <span className={clsx(
            'w-1.5 h-1.5 rounded-full',
            isDemo ? 'bg-accent-amber' : 'bg-accent-emerald'
          )} />
          {isDemo ? 'Demo' : modelName || 'Groq'}
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(nextTheme[theme])}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          aria-label={`Switch to ${nextTheme[theme]} theme`}
          title={`Current: ${theme} theme`}
        >
          <ThemeIcon size={16} />
        </button>
      </div>
    </header>
  );
}
