'use client';

import React from 'react';

export type NavTab = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

type MobileNavProps = {
  tabs: NavTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
};

export function MobileNav({ tabs, activeTab, onTabChange }: MobileNavProps) {
  return (
    <nav className="mobile-nav" aria-label="Main navigation">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`mobile-nav-btn${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          aria-label={tab.label}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default MobileNav;