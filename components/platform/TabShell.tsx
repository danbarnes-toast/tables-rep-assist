'use client';

// =============================================================
// Toast Tables Platform - TabShell
// Shell for multi-tab functional apps (AMs, AEs, OCs, Support).
// Desktop: header + horizontal tab bar + content area.
// Mobile: compact header + full-screen content + MobileNav.
// Sets data-persona for CSS token override.
// =============================================================

import React from 'react';
import { ToastFlame } from './ToastFlame';
import { MobileNav } from './MobileNav';
import type { NavTab } from './MobileNav';

type TabShellProps = {
  /** data-persona value, controls accent color tokens */
  persona: string;
  /** App name shown in header (e.g. "Account Manager") */
  appName: string;
  /** Accent word in the name (e.g. "Manager") rendered in accent color */
  appNameAccent?: string;
  /** Right-side header slot: avatar, sign-out, etc. */
  headerRight?: React.ReactNode;
  /** Ordered list of tabs with id, label, icon, and content. */
  tabs: (NavTab & { content: React.ReactNode })[];
  activeTab: string;
  onTabChange: (id: string) => void;
};

export function TabShell({
  persona,
  appName,
  appNameAccent,
  headerRight,
  tabs,
  activeTab,
  onTabChange,
}: TabShellProps) {
  const activeContent = tabs.find(t => t.id === activeTab)?.content;

  return (
    <div data-persona={persona} className="tab-shell">
      {/* Header */}
      <header className="tab-shell-header">
        <div className="tab-shell-header-inner">
          {/* Left: logo + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'var(--color-accent-dim)',
                border: '1px solid var(--color-accent-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ToastFlame size={14} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
              {appNameAccent ? (
                <>
                  {appName.replace(appNameAccent, '')}<span style={{ color: 'var(--color-accent)' }}>{appNameAccent}</span>
                </>
              ) : appName}
            </span>
          </div>

          {/* Center: tab bar (desktop only) */}
          <nav className="tab-bar-desktop">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-bar-btn${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right: caller-supplied slot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {headerRight}
          </div>
        </div>
      </header>

      {/* Content area */}
      <div className="tab-shell-content tab-scroll-pad">
        {activeContent}
      </div>

      {/* Mobile bottom nav */}
      <MobileNav
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
    </div>
  );
}

export default TabShell;