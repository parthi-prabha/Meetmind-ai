import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-bg-primary">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      {/* Desktop: margin matches sidebar width. Mobile: no margin (sidebar is overlay). */}
      <div
        className="flex flex-col min-h-screen transition-[margin-left] duration-200 ease-in-out lg:ml-64"
        style={{ marginLeft: undefined }}
      >
        <style>{`
          @media (min-width: 1024px) {
            .layout-main { margin-left: ${collapsed ? 64 : 256}px !important; }
          }
        `}</style>
        <div className="layout-main flex flex-col min-h-screen transition-[margin-left] duration-200 ease-in-out">
          <TopBar onMobileMenuOpen={() => setMobileOpen(true)} />
          <main className="flex-1 p-4 lg:p-6 max-w-[1400px] w-full mx-auto">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
