'use client';

import React, { useState } from 'react';

export type NavTab = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

type MobileNavProps = {
  tabs: NavTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Tab IDs to show directly in the nav bar (max 5). Rest appear in More sheet. */
  primaryTabIds?: string[];
};

const MoreIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
  </svg>
);

const CloseIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export function MobileNav({ tabs, activeTab, onTabChange, primaryTabIds }: MobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  // Split tabs into primary (shown in nav bar) and secondary (shown in More sheet)
  const primaryIds = primaryTabIds ?? tabs.slice(0, 5).map(t => t.id);
  const primaryTabs = tabs.filter(t => primaryIds.includes(t.id));
  const secondaryTabs = tabs.filter(t => !primaryIds.includes(t.id));
  const hasSecondary = secondaryTabs.length > 0;
  const secondaryActive = secondaryTabs.some(t => t.id === activeTab);

  const handleTabChange = (id: string) => {
    setMoreOpen(false);
    onTabChange(id);
  };

  return (
    <>
      {/* More sheet backdrop */}
      {moreOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* More sheet */}
      {moreOpen && hasSecondary && (
        <div className="mobile-nav-more-sheet" role="dialog" aria-label="More navigation options">
          <div className="mobile-nav-more-header">
            <span className="mobile-nav-more-title">More</span>
            <button className="mobile-nav-more-close" onClick={() => setMoreOpen(false)} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          <div className="mobile-nav-more-grid">
            {secondaryTabs.map(tab => (
              <button
                key={tab.id}
                className={`mobile-nav-more-btn${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
                aria-label={tab.label}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="mobile-nav" aria-label="Main navigation">
        {primaryTabs.map(tab => (
          <button
            key={tab.id}
            className={`mobile-nav-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
            aria-label={tab.label}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
        {hasSecondary && (
          <button
            className={`mobile-nav-btn${secondaryActive || moreOpen ? ' active' : ''}`}
            onClick={() => setMoreOpen(v => !v)}
            aria-label="More"
            aria-expanded={moreOpen}
          >
            <MoreIcon />
            <span>More</span>
          </button>
        )}
      </nav>
    </>
  );
}

export default MobileNav;
