// Theme engine — monthly auto-theme + light/dark toggle
// Each theme swaps CSS custom properties; the rest of the UI uses var(--accent) etc.

export interface ExecProfile {
  name: string;
  title: string;
  photo: string; // Slack image_512 CDN URL
  caption: string; // playful one-liner shown in header tooltip
}

export interface Theme {
  id: string;
  name: string;
  emoji: string;
  // CSS variable overrides (applied to :root)
  accent: string;        // primary brand color (replaces orange-500)
  accentHover: string;
  accentLight: string;   // tinted backgrounds
  accentGlow: string;    // rgba glow for borders/cards
  accentText: string;    // text on accent bg
  // Optional exec feature
  exec?: ExecProfile;
  // Months this theme is active (1-indexed, can span 2 months)
  months: number[];
  // Optional sub-range within month (for World Cup ending Jul 19)
  endDay?: { month: number; day: number };
}

export const EXEC_PHOTOS = {
  aman: {
    name: 'Aman Narang',
    title: 'CEO',
    photo: 'https://avatars.slack-edge.com/2020-07-25/1261482553909_d32d58c591307d2802ab_512.jpg',
  },
  mike: {
    name: 'Mike Miller',
    title: 'Chief Product Officer',
    photo: 'https://avatars.slack-edge.com/2026-06-19/11431710101264_14279b1eaf93ccfc6c07_512.jpg',
  },
  dario: {
    name: 'Dario Sava',
    title: 'Sr Director of Product',
    photo: 'https://avatars.slack-edge.com/2021-03-29/1921009757169_b26150388f21741dafaf_512.jpg',
  },
  craig: {
    name: 'Craig Daniel',
    title: 'SVP & GM, Guest & New Ventures',
    photo: 'https://avatars.slack-edge.com/2026-04-29/11023427336978_41b6fcfa51a0fea068a4_512.png',
  },
} as const;

export const THEMES: Theme[] = [
  {
    id: 'world-cup',
    name: 'World Cup 2026',
    emoji: '⚽',
    accent: '#c9a227',
    accentHover: '#b8911f',
    accentLight: 'rgba(201,162,39,0.1)',
    accentGlow: 'rgba(201,162,39,0.25)',
    accentText: '#000',
    months: [6, 7],
    endDay: { month: 7, day: 19 },
  },
  {
    id: 'post-camp',
    name: 'Post-Camp Glow',
    emoji: '🏕️',
    accent: '#ff4c00',
    accentHover: '#e63d00',
    accentLight: 'rgba(255,76,0,0.08)',
    accentGlow: 'rgba(255,76,0,0.2)',
    accentText: '#fff',
    months: [7],
    // active Jul 20–31
  },
  {
    id: 'back-to-school',
    name: 'Back to School',
    emoji: '📚',
    accent: '#3b82f6',
    accentHover: '#2563eb',
    accentLight: 'rgba(59,130,246,0.08)',
    accentGlow: 'rgba(59,130,246,0.2)',
    accentText: '#fff',
    months: [8],
  },
  {
    id: 'earnings',
    name: 'Earnings Season',
    emoji: '📈',
    accent: '#10b981',
    accentHover: '#059669',
    accentLight: 'rgba(16,185,129,0.08)',
    accentGlow: 'rgba(16,185,129,0.2)',
    accentText: '#fff',
    months: [9],
    exec: {
      ...EXEC_PHOTOS.aman,
      caption: 'CEO Mode — make the numbers go up',
    },
  },
  {
    id: 'halloween',
    name: 'Halloween',
    emoji: '🎃',
    accent: '#a855f7',
    accentHover: '#9333ea',
    accentLight: 'rgba(168,85,247,0.08)',
    accentGlow: 'rgba(168,85,247,0.2)',
    accentText: '#fff',
    months: [10],
    exec: {
      ...EXEC_PHOTOS.dario,
      caption: 'Dario has notes. Many notes.',
    },
  },
  {
    id: 'toast-birthday',
    name: 'Toast Birthday',
    emoji: '🍞',
    accent: '#ff4c00',
    accentHover: '#e63d00',
    accentLight: 'rgba(255,76,0,0.08)',
    accentGlow: 'rgba(255,76,0,0.2)',
    accentText: '#fff',
    months: [11],
    exec: {
      ...EXEC_PHOTOS.aman,
      caption: 'Happy birthday to us. Aman is pleased.',
    },
  },
  {
    id: 'holiday',
    name: 'Holiday',
    emoji: '❄️',
    accent: '#dc2626',
    accentHover: '#b91c1c',
    accentLight: 'rgba(220,38,38,0.08)',
    accentGlow: 'rgba(220,38,38,0.2)',
    accentText: '#fff',
    months: [12],
  },
  {
    id: 'ako',
    name: 'Annual Kickoff',
    emoji: '🚀',
    accent: '#f59e0b',
    accentHover: '#d97706',
    accentLight: 'rgba(245,158,11,0.08)',
    accentGlow: 'rgba(245,158,11,0.2)',
    accentText: '#000',
    months: [1],
    exec: {
      ...EXEC_PHOTOS.aman,
      caption: 'AKO energy. Aman has a deck for this.',
    },
  },
  {
    id: 'valentines',
    name: "Valentine's",
    emoji: '♥',
    accent: '#e11d48',
    accentHover: '#be123c',
    accentLight: 'rgba(225,29,72,0.08)',
    accentGlow: 'rgba(225,29,72,0.2)',
    accentText: '#fff',
    months: [2],
  },
  {
    id: 'march-madness',
    name: 'March Madness',
    emoji: '🏀',
    accent: '#ea580c',
    accentHover: '#c2410c',
    accentLight: 'rgba(234,88,12,0.08)',
    accentGlow: 'rgba(234,88,12,0.2)',
    accentText: '#fff',
    months: [3],
    exec: {
      ...EXEC_PHOTOS.craig,
      caption: 'Craig filled out the bracket. Sales wins.',
    },
  },
  {
    id: 'spring',
    name: 'Spring Launch',
    emoji: '🌱',
    accent: '#16a34a',
    accentHover: '#15803d',
    accentLight: 'rgba(22,163,74,0.08)',
    accentGlow: 'rgba(22,163,74,0.2)',
    accentText: '#fff',
    months: [4],
    exec: {
      ...EXEC_PHOTOS.mike,
      caption: "Mike's spring drop. The roadmap is ready.",
    },
  },
  {
    id: 'mothers-day',
    name: "Mother's Day",
    emoji: '🌸',
    accent: '#a21caf',
    accentHover: '#86198f',
    accentLight: 'rgba(162,28,175,0.08)',
    accentGlow: 'rgba(162,28,175,0.2)',
    accentText: '#fff',
    months: [5],
  },
];

export function getThemeForDate(date: Date): Theme {
  const month = date.getMonth() + 1; // 1-indexed
  const day = date.getDate();

  if (month === 7) {
    return THEMES.find(t => t.id === 'post-camp')!;
  }

  return THEMES.find(t => t.months.includes(month)) ?? THEMES.find(t => t.id === 'post-camp')!;
}

export function applyTheme(theme: Theme, isDark: boolean) {
  const root = document.documentElement;
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-hover', theme.accentHover);
  root.style.setProperty('--accent-light', theme.accentLight);
  root.style.setProperty('--accent-glow', theme.accentGlow);
  root.style.setProperty('--accent-text', theme.accentText);

  if (isDark) {
    root.style.setProperty('--bg-page', '#0e0e10');
    root.style.setProperty('--bg-card', '#18181b');
    root.style.setProperty('--bg-card-hover', '#1f1f23');
    root.style.setProperty('--bg-input', '#18181b');
    root.style.setProperty('--bg-header', '#111113');
    root.style.setProperty('--bg-strip', '#0e0e10');
    root.style.setProperty('--border', 'rgba(255,255,255,0.08)');
    root.style.setProperty('--border-subtle', 'rgba(255,255,255,0.04)');
    root.style.setProperty('--text-primary', '#f4f4f5');
    root.style.setProperty('--text-secondary', 'rgba(244,244,245,0.5)');
    root.style.setProperty('--text-tertiary', 'rgba(244,244,245,0.3)');
    root.style.setProperty('--bubble-ai', '#18181b');
    root.style.setProperty('--bubble-ai-border', 'rgba(255,255,255,0.08)');
    root.style.setProperty('--shadow', '0 1px 3px rgba(0,0,0,0.4)');
  } else {
    root.style.setProperty('--bg-page', '#fafafa');
    root.style.setProperty('--bg-card', '#ffffff');
    root.style.setProperty('--bg-card-hover', '#f9f9f9');
    root.style.setProperty('--bg-input', '#ffffff');
    root.style.setProperty('--bg-header', '#ffffff');
    root.style.setProperty('--bg-strip', '#f5f5f5');
    root.style.setProperty('--border', 'rgba(0,0,0,0.08)');
    root.style.setProperty('--border-subtle', 'rgba(0,0,0,0.04)');
    root.style.setProperty('--text-primary', '#111111');
    root.style.setProperty('--text-secondary', 'rgba(0,0,0,0.5)');
    root.style.setProperty('--text-tertiary', 'rgba(0,0,0,0.3)');
    root.style.setProperty('--bubble-ai', '#f5f5f5');
    root.style.setProperty('--bubble-ai-border', 'rgba(0,0,0,0.06)');
    root.style.setProperty('--shadow', '0 1px 3px rgba(0,0,0,0.08)');
  }
}
