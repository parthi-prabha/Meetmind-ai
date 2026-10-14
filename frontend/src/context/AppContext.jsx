import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../lib/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [samples, setSamples] = useState([]);
  const [theme, setThemeState] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('meetmind-theme') || 'dark';
    }
    return 'dark';
  });

  const setTheme = useCallback((t) => {
    setThemeState(t);
    localStorage.setItem('meetmind-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error);
    api.getSamples().then(setSamples).catch(console.error);
  }, []);

  const value = {
    config,
    samples,
    theme,
    setTheme,
    isDemo: config?.mode === 'demo',
    modelName: config?.model || null,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
