'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import type { RepContext, AccountContext } from '@/lib/system-prompt';
import { THEMES, getThemeForDate, applyTheme, type Theme } from '@/lib/themes';
import {
  OT_TIERS, TABLES_MONTHLY, RWG_BY_CATEGORY, TOAST_LOCAL_MONTHLY_AVG,
  EM_LIFT_PCT, ADS_CPA_LOW, ADS_CPA_HIGH, ADS_MONTHLY_SPEND_DEFAULT, OT_NETWORK_PCT,
  type OtTierKey, type CategoryKey,
} from '@/lib/roi-data';

type Mode = 'ask' | 'train' | 'prep' | 'roi' | 'accounts' | 'proof';

// ── Toast flame SVG ────────────────────────────────────────────────────────
function ToastFlame({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        fillRule="evenodd" clipRule="evenodd"
        d="M12 2C12 2 7 7.5 7 13a5 5 0 0010 0c0-2.5-1.5-4.5-3-6 0 2-1 3.5-2 4.5A3 3 0 019 13c0-3 3-11 3-11z"
        fill="var(--accent)"
      />
    </svg>
  );
}

// ── Markdown renderer ──────────────────────────────────────────────────────
function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (raw: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let remaining = raw
      .replace(/\[CONFIRM WITH PM\]/g, '___CONFIRM___')
      .replace(/\[External OK\]/g, '___EXTOK___')
      .replace(/\[Internal only\]/g, '___INTONLY___');
    let key = 0;
    const segments = remaining.split(/(\*\*[^*]+\*\*|`[^`]+`|___CONFIRM___|___EXTOK___|___INTONLY___)/);
    for (const seg of segments) {
      if (!seg) continue;
      if (seg.startsWith('**') && seg.endsWith('**')) {
        parts.push(<strong key={key++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{seg.slice(2, -2)}</strong>);
      } else if (seg.startsWith('`') && seg.endsWith('`')) {
        parts.push(<code key={key++} style={{ background: 'var(--border)', color: 'var(--text-primary)', borderRadius: 4, padding: '1px 5px', fontSize: '11px', fontFamily: 'monospace' }}>{seg.slice(1, -1)}</code>);
      } else if (seg === '___CONFIRM___') {
        parts.push(<span key={key++} style={{ display: 'inline-block', background: 'rgba(245,158,11,0.12)', color: '#d97706', fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 6, marginLeft: 4 }}>CONFIRM WITH PM</span>);
      } else if (seg === '___EXTOK___') {
        parts.push(<span key={key++} style={{ display: 'inline-block', background: 'rgba(16,185,129,0.1)', color: '#059669', fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 6, marginLeft: 4 }}>External OK</span>);
      } else if (seg === '___INTONLY___') {
        parts.push(<span key={key++} style={{ display: 'inline-block', background: 'rgba(239,68,68,0.1)', color: '#dc2626', fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 6, marginLeft: 4 }}>Internal only</span>);
      } else {
        parts.push(<span key={key++}>{seg}</span>);
      }
    }
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { elements.push(<div key={i} style={{ height: 8 }} />); i++; continue; }
    if (line.startsWith('## ')) {
      elements.push(<p key={i} style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, marginTop: 12, marginBottom: 4 }}>{line.slice(3)}</p>);
      i++; continue;
    }
    if (line.startsWith('### ')) {
      elements.push(<p key={i} style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>{line.slice(4)}</p>);
      i++; continue;
    }
    if (line.startsWith('> ')) {
      elements.push(<blockquote key={i} style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 10, color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: 13, margin: '4px 0' }}>{renderInline(line.slice(2))}</blockquote>);
      i++; continue;
    }
    if (line.match(/^[-*] /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(<li key={i} style={{ marginBottom: 2 }}>{renderInline(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} style={{ listStyle: 'disc', paddingLeft: 18, fontSize: 13, margin: '4px 0', color: 'var(--text-primary)' }}>{items}</ul>);
      continue;
    }
    if (line.match(/^\d+\. /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(<li key={i} style={{ marginBottom: 2 }}>{renderInline(lines[i].replace(/^\d+\. /, ''))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} style={{ listStyle: 'decimal', paddingLeft: 18, fontSize: 13, margin: '4px 0', color: 'var(--text-primary)' }}>{items}</ol>);
      continue;
    }
    elements.push(<p key={i} style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-primary)', margin: 0 }}>{renderInline(line)}</p>);
    i++;
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{elements}</div>;
}

// ── Types ──────────────────────────────────────────────────────────────────
interface ChorusCall { call_date: string; participants: string; summary: string; action_items: string; }
interface Account {
  name: string; city: string; state: string;
  signed_date: string; activation_status: string; is_activated: boolean;
  bookings_90d: number; covers_90d: number; last_booking_date: string | null;
  monthly_trend: { month: string; bookings: number; covers: number }[];
  chorus_calls?: ChorusCall[];
  current_booking_platform?: string;
  note?: string;
}
interface SimilarAccount { name: string; city: string; state: string; bookings_90d: number; covers_90d: number; }
interface RepData {
  rep_name: string; team: string; region: string; seeded_at: string;
  slack_photo?: string; title?: string;
  accounts: Account[]; similar_accounts: SimilarAccount[];
}

function buildAccountPayload(acct: Account): AccountContext {
  return {
    name: acct.name, city: acct.city, state: acct.state,
    activation_status: acct.activation_status,
    current_booking_platform: acct.current_booking_platform,
    bookings_90d: acct.bookings_90d,
    chorus_calls: (acct.chorus_calls ?? []).slice(0, 2).map(c => ({
      call_date: c.call_date,
      summary: c.summary.replace(/<[^>]+>/g, ' ').trim().slice(0, 300),
      action_items: c.action_items,
    })),
  };
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function parseSuggestions(text: string): { display: string; suggestions: string[] } {
  const match = text.match(/<suggestions>([\s\S]*?)<\/suggestions>/);
  if (!match) return { display: text, suggestions: [] };
  return {
    display: text.replace(/<suggestions>[\s\S]*?<\/suggestions>/, '').trimEnd(),
    suggestions: match[1].split('\n').map(s => s.trim()).filter(Boolean),
  };
}

// ── Theme picker ───────────────────────────────────────────────────────────
function ThemePicker({
  activeTheme, isDark, onTheme, onToggleDark,
}: {
  activeTheme: Theme; isDark: boolean;
  onTheme: (t: Theme) => void; onToggleDark: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Dark/light toggle */}
      <button
        onClick={onToggleDark}
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--bg-strip)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? '☀️' : '🌙'}
      </button>

      {/* Theme picker */}
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            height: 32, padding: '0 10px', borderRadius: 8,
            background: 'var(--bg-strip)', border: '1px solid var(--border)',
            cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--text-secondary)', transition: 'background 0.15s',
          }}
        >
          <span>{activeTheme.emoji}</span>
          <span style={{ fontSize: 11 }}>{activeTheme.name}</span>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            zIndex: 100, width: 220,
          }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: 8, fontFamily: 'monospace' }}>Theme</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { onTheme(t); setOpen(false); }}
                  title={t.name}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: t.accent, border: activeTheme.id === t.id ? '3px solid var(--text-primary)' : '2px solid transparent',
                    cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'transform 0.15s, border-color 0.15s',
                    transform: activeTheme.id === t.id ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  {t.emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Exec badge (shown in header when theme has an exec) ────────────────────
function ExecBadge({ exec }: { exec: NonNullable<Theme['exec']> }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <img
        src={exec.photo} alt={exec.name}
        style={{
          width: 26, height: 26, borderRadius: '50%',
          border: '2px solid var(--accent)', objectFit: 'cover',
          cursor: 'default', opacity: 0.9,
        }}
      />
      {hover && (
        <div className="exec-tooltip">
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{exec.name}</p>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{exec.title}</p>
          <p style={{ fontSize: 11, color: 'var(--accent)', fontStyle: 'italic' }}>&ldquo;{exec.caption}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

// ── Streak tracking ────────────────────────────────────────────────────────
function useStreak(): number {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem('rep_streak_last');
    const count = parseInt(localStorage.getItem('rep_streak_count') ?? '0', 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let next = 1;
    if (last === today) next = count;
    else if (last === yesterday) next = count + 1;
    localStorage.setItem('rep_streak_last', today);
    localStorage.setItem('rep_streak_count', String(next));
    setStreak(next);
  }, []);
  return streak;
}

// ── Confetti burst ─────────────────────────────────────────────────────────
function ConfettiBurst({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  useEffect(() => {
    if (visible) { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }
  }, [visible, onDone]);
  if (!visible) return null;
  const pieces = Array.from({ length: 32 }, (_, i) => {
    const hue = (i * 37) % 360;
    const x = -40 + (i * 83) % 120;
    const delay = (i * 60) % 800;
    const size = 6 + (i % 4) * 3;
    return { hue, x, delay, size };
  });
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999 }}>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: 0,
          left: `calc(50% + ${p.x}px)`,
          width: p.size,
          height: p.size,
          borderRadius: i % 3 === 0 ? '50%' : 2,
          background: `hsl(${p.hue}, 80%, 55%)`,
          animation: `confetti-fall ${1.4 + (p.delay / 1000)}s ease-in forwards`,
          animationDelay: `${p.delay}ms`,
        }} />
      ))}
    </div>
  );
}

// ── Onboarding banner (first login only) ──────────────────────────────────
const ONBOARDING_STEPS = [
  { icon: '1', label: 'Pick an account', detail: 'Go to Pipeline, select a prospect.' },
  { icon: '2', label: 'Generate a prep brief', detail: 'Hit Prep and run a brief before your call.' },
  { icon: '3', label: 'Ask anything', detail: 'Use Ask to handle objections live.' },
];

function OnboardingBanner({ onDismiss, onGo }: { onDismiss: () => void; onGo: (mode: Mode) => void }) {
  return (
    <div style={{
      position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)', maxWidth: 700, zIndex: 400,
      background: 'var(--bg-card)', border: '1px solid var(--accent-glow)',
      borderRadius: 14, padding: '14px 18px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Three things to try first</p>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}>x</button>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {ONBOARDING_STEPS.map((s, i) => (
          <button key={i}
            onClick={() => { onGo(i === 0 ? 'accounts' : i === 1 ? 'prep' : 'ask'); onDismiss(); }}
            style={{ flex: 1, background: 'var(--bg-strip)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.icon}</span>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</p>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{s.detail}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Daily greeting + quote ─────────────────────────────────────────────────
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SALES_QUOTES = [
  { quote: "Every call is an opportunity to change someone's business.", attr: 'field wisdom' },
  { quote: "The best close is a genuine conversation.", attr: 'sales lore' },
  { quote: "Preparation is the close that happens before the call.", attr: 'field wisdom' },
  { quote: "Objections are just requests for more information.", attr: 'sales lore' },
  { quote: "You don't close deals. You help people make decisions.", attr: 'field wisdom' },
  { quote: "The rep who listens most wins most.", attr: 'field wisdom' },
  { quote: "Every no gets you closer to a yes.", attr: 'sales lore' },
];
const SPARKS = ['Have a great one.', "Let's go.", 'Go get it.', 'Make it count.', 'Today could be the day.'];

function getDailyContent(date: Date) {
  const dayIdx = date.getDay();
  const seed = date.getFullYear() * 1000 + Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
  const hour = date.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return {
    dayName: DAYS[dayIdx],
    greeting,
    quote: SALES_QUOTES[seed % SALES_QUOTES.length],
    spark: SPARKS[seed % SPARKS.length],
  };
}

// ── Identity gate ──────────────────────────────────────────────────────────
function IdentityGate({ onConfirm, activeTheme }: { onConfirm: (email: string) => void; activeTheme: Theme }) {
  const [email, setEmail] = useState('');
  const [daily] = useState(() => getDailyContent(new Date()));

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      background: 'var(--bg-page)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Radial glow behind card */}
      <div style={{
        position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 480, height: 480, borderRadius: '50%',
        background: `radial-gradient(circle, ${activeTheme.accentGlow} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative', width: '100%', maxWidth: 380,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 20, padding: 32, boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
      }}>
        {/* Day + greeting */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            {daily.dayName}
          </p>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--accent-light)', border: '1px solid var(--accent-glow)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
          }}>
            <ToastFlame size={26} />
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            {daily.greeting}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 0 }}>
            Enter your Toast email to continue
          </p>
        </div>

        <form onSubmit={e => { e.preventDefault(); if (email.includes('@')) onConfirm(email.toLowerCase().trim()); }}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@toasttab.com"
            className="themed-input"
            style={{ marginBottom: 12 }}
            autoFocus
          />
          <button type="submit" disabled={!email.includes('@')} className="btn-primary" style={{ width: '100%' }}>
            Continue
          </button>
        </form>

        {/* Quote */}
        <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--bg-strip)', borderRadius: 10, borderLeft: '2px solid var(--accent)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5, marginBottom: 4 }}>
            "{daily.quote.quote}"
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
            {daily.spark}
          </p>
        </div>

        <p style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: 'var(--text-tertiary)' }}>
          {activeTheme.emoji} {activeTheme.name} edition
        </p>
      </div>
    </div>
  );
}

// ── Prep brief ─────────────────────────────────────────────────────────────
interface OpenCommitment { owner: string; item: string; status: 'pending' | 'likely_done' | 'unknown'; }
interface PredictedObjection { objection: string; counter: string; }
interface PrepBrief {
  situation: string; discussed: string[]; open_commitments: OpenCommitment[];
  predicted_objections: PredictedObjection[]; suggested_opening: string;
  one_close: string; confidence: 'high' | 'medium' | 'low'; confidence_reason: string;
}

function PrepTab({ repData, selectedAccountIdx, setSelectedAccountIdx }: {
  repData: RepData | null; selectedAccountIdx: number | null; setSelectedAccountIdx: (i: number | null) => void;
}) {
  const [brief, setBrief] = useState<PrepBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastIdx, setLastIdx] = useState<number | null>(null);
  const selected = selectedAccountIdx !== null ? (repData?.accounts[selectedAccountIdx] ?? null) : null;

  const generate = async (idx: number) => {
    if (!repData) return;
    const acct = repData.accounts[idx];
    setLoading(true); setError(null); setBrief(null); setLastIdx(idx);
    try {
      const res = await fetch('/api/prep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repName: repData.rep_name, repTeam: repData.team,
          account: {
            name: acct.name, city: acct.city, state: acct.state,
            signed_date: acct.signed_date, activation_status: acct.activation_status,
            is_activated: acct.is_activated, bookings_90d: acct.bookings_90d,
            current_booking_platform: acct.current_booking_platform,
            chorus_calls: (acct.chorus_calls ?? []).map(c => ({ call_date: c.call_date, summary: c.summary, action_items: c.action_items })),
          },
        }),
      });
      const data = await res.json() as { brief?: PrepBrief; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.brief) setBrief(data.brief);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  };

  const confColor = { high: '#059669', medium: '#d97706', low: '#dc2626' };
  const confBg = { high: 'rgba(16,185,129,0.08)', medium: 'rgba(245,158,11,0.08)', low: 'rgba(220,38,38,0.08)' };
  const statusIcon = { pending: { icon: '○', color: '#d97706' }, likely_done: { icon: '✓', color: '#059669' }, unknown: { icon: '?', color: 'var(--text-tertiary)' } };

  if (!repData) return <div style={{ paddingTop: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading account data...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>Pre-Call Brief</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {repData.accounts.map((acct, i) => {
          const sel = selectedAccountIdx === i;
          return (
            <button key={acct.name} onClick={() => { setSelectedAccountIdx(i); if (lastIdx !== i) generate(i); }}
              style={{
                textAlign: 'left', borderRadius: 12, padding: '12px 16px',
                background: sel ? 'var(--accent-light)' : 'var(--bg-card)',
                border: `1px solid ${sel ? 'var(--accent-glow)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{acct.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{acct.city}, {acct.state} · {acct.activation_status}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(acct.chorus_calls?.length ?? 0) > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-light)', border: '1px solid var(--accent-glow)', padding: '2px 8px', borderRadius: 10 }}>
                      {acct.chorus_calls!.length} call{acct.chorus_calls!.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sel ? '▼' : '▶'}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {loading && selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="glow-card" style={{ padding: '14px 18px' }}>
            <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, marginBottom: 4 }}>Generating brief for {selected.name}...</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Synthesizing {selected.chorus_calls?.length ?? 0} calls + deal context</p>
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card" style={{ gap: 8, display: 'flex', flexDirection: 'column' }}>
              <div className="skeleton" style={{ height: 10, width: 80 }} />
              <div className="skeleton" style={{ height: 10, width: '100%' }} />
              <div className="skeleton" style={{ height: 10, width: '70%' }} />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#dc2626' }}>
          {error}
          <button onClick={() => selectedAccountIdx !== null && generate(selectedAccountIdx)} style={{ marginLeft: 12, fontSize: 11, color: '#dc2626', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {brief && selected && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{repData.rep_name.split(' ')[0]}&apos;s brief: {selected.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{selected.city}, {selected.state} · {selected.chorus_calls?.length ?? 0} calls · {selected.activation_status}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 10, background: confBg[brief.confidence], color: confColor[brief.confidence], border: `1px solid ${confColor[brief.confidence]}30` }}>
                {brief.confidence}
              </span>
              <button onClick={() => selectedAccountIdx !== null && generate(selectedAccountIdx)}
                style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-strip)', border: '1px solid var(--border)', borderRadius: 8, padding: '3px 10px', cursor: 'pointer' }}>
                Refresh
              </button>
            </div>
          </div>

          <div className="glow-card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', fontFamily: 'monospace', marginBottom: 8 }}>Situation</p>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65 }}>{brief.situation}</p>
            {brief.confidence_reason && <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, fontStyle: 'italic' }}>{brief.confidence_reason}</p>}
          </div>

          <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 16, padding: '16px 18px' }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', fontFamily: 'monospace', marginBottom: 8 }}>Open with this</p>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.65 }}>&ldquo;{brief.suggested_opening}&rdquo;</p>
          </div>

          {brief.discussed.length > 0 && (
            <div className="card">
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginBottom: 12 }}>What&apos;s been discussed</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {brief.discussed.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-primary)' }}>
                    <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }}>·</span>
                    <span style={{ lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {brief.open_commitments.length > 0 && (
            <div className="card">
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginBottom: 12 }}>Open commitments</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {brief.open_commitments.map((c, i) => {
                  const st = statusIcon[c.status];
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ color: st.color, fontWeight: 700, flexShrink: 0, fontSize: 13, marginTop: 1 }}>{st.icon}</span>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginRight: 6 }}>{c.owner}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{c.item}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {brief.predicted_objections.length > 0 && (
            <div className="card">
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginBottom: 12 }}>Likely objections</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {brief.predicted_objections.map((obj, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 6, padding: '2px 7px', fontWeight: 600, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}>them</span>
                      <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.6 }}>&ldquo;{obj.objection}&rdquo;</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.08)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, padding: '2px 7px', fontWeight: 600, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}>you</span>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{obj.counter}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: 'var(--bg-strip)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px' }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginBottom: 8 }}>One thing to close on</p>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.65 }}>{brief.one_close}</p>
          </div>
        </div>
      )}

      {!selected && !loading && !brief && (
        <div style={{ paddingTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>Click an account above to generate a brief.</div>
      )}
    </div>
  );
}

// ── Accounts tab ───────────────────────────────────────────────────────────
function AccountsTab({ data }: { data: RepData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{data.rep_name}</p>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{data.team} · {data.region} · Updated {new Date(data.seeded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
      </div>

      <div>
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginBottom: 12 }}>Your Accounts</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.accounts.map(acct => {
            const days = acct.is_activated ? null : daysSince(acct.signed_date);
            const action = (() => {
              if (acct.is_activated || days === null) return null;
              if (days < 7) return { text: 'Schedule setup call', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' };
              if (days < 14) return { text: 'Setup call overdue — check in', color: '#d97706', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' };
              return { text: 'At risk — follow up now', color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)' };
            })();

            return (
              <div key={acct.name} className="card" style={{ gap: 12, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13 }}>{acct.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{acct.city}, {acct.state} · Signed {acct.signed_date}</p>
                    {acct.current_booking_platform && acct.current_booking_platform !== 'None' && (
                      <span style={{ display: 'inline-block', marginTop: 4, background: 'rgba(139,92,246,0.08)', color: '#7c3aed', border: '1px solid rgba(139,92,246,0.2)', fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 8 }}>
                        on {acct.current_booking_platform}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 10,
                      background: acct.is_activated ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                      color: acct.is_activated ? '#059669' : '#d97706',
                      border: `1px solid ${acct.is_activated ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                    }}>
                      {acct.is_activated ? 'Activated' : acct.activation_status}
                    </span>
                    {days !== null && (() => {
                      const target = new Date(acct.signed_date);
                      target.setDate(target.getDate() + 30);
                      const targetStr = target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      return <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>activate by {targetStr} · day {days}</span>;
                    })()}
                  </div>
                </div>

                {action && (
                  <div style={{ fontSize: 11, fontWeight: 500, padding: '8px 12px', borderRadius: 10, background: action.bg, color: action.color, border: `1px solid ${action.border}` }}>
                    {action.text}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'bookings (90d)', value: acct.bookings_90d.toLocaleString() },
                    { label: 'covers (90d)', value: acct.covers_90d.toLocaleString() },
                    { label: 'last booking', value: acct.last_booking_date ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'var(--bg-strip)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{value}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</p>
                    </div>
                  ))}
                </div>

                {acct.note && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10, padding: '8px 12px' }}>{acct.note}</div>
                )}

                {(acct.chorus_calls?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>Last Chorus Calls</p>
                    {acct.chorus_calls!.map((call, idx) => {
                      const items = (() => { try { return JSON.parse(call.action_items) as string[]; } catch { return call.action_items ? [call.action_items] : []; } })();
                      return (
                        <div key={idx} style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <p style={{ fontSize: 11, color: '#3b82f6', fontWeight: 500 }}>{call.call_date}</p>
                          {call.summary && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{call.summary.replace(/<br>/gi, ' ').replace(/Action Items:[\s\S]*?Meeting Summary:/, 'Meeting Summary:').trim()}</p>}
                          {items.length > 0 && (
                            <div>
                              <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 4 }}>Action items:</p>
                              <ul style={{ paddingLeft: 14, margin: 0 }}>
                                {items.slice(0, 3).map((item, i) => <li key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{item}</li>)}
                                {items.length > 3 && <li style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>+{items.length - 3} more</li>}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {data.similar_accounts.length > 0 && (
        <div>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginBottom: 4 }}>Similar Active Accounts in Your Region</p>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>Use these as proof points on a call.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.similar_accounts.map(a => (
              <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{a.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.city}, {a.state}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{a.bookings_90d.toLocaleString()}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>bookings / 90d</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chat pane ──────────────────────────────────────────────────────────────
const SUGGESTIONS: Record<'ask' | 'train', string[]> = {
  ask: [
    'What do I say when a prospect uses OpenTable?',
    'How do I qualify a prospect before pitching?',
    'Can Tables handle ticketed events?',
    'What stats are safe to share with a prospect?',
    'Show me examples of private dining customers',
    'What makes Tables different from SevenRooms?',
  ],
  train: [
    'Give me an intro to Toast Tables: what is it and who buys it?',
    'Walk me through a full sales qualification conversation',
    'Teach me the OpenTable competitive objection cold',
    'What are the most common reasons deals stall?',
    'Show me a case study for a fine dining prospect',
    'How does activation work after a restaurant signs?',
  ],
};

function ChatPane({ mode, repData, selectedAccountIdx, setSelectedAccountIdx }: {
  mode: 'ask' | 'train'; repData: RepData | null;
  selectedAccountIdx: number | null; setSelectedAccountIdx: (i: number | null) => void;
}) {
  const { messages, sendMessage, status: chatStatus } = useChat({ id: mode });
  const [input, setInput] = useState('');
  const isLoading = chatStatus === 'streaming' || chatStatus === 'submitted';
  const bottomRef = useRef<HTMLDivElement>(null);
  const selected = selectedAccountIdx !== null ? (repData?.accounts[selectedAccountIdx] ?? null) : null;

  const contextRef = useRef<{ repContext?: RepContext; accountContext?: AccountContext }>({});
  contextRef.current = {
    repContext: repData ? { rep_name: repData.rep_name, team: repData.team, region: repData.region } : undefined,
    accountContext: selected ? buildAccountPayload(selected) : undefined,
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  const submit = (text: string) => {
    if (!text.trim()) return;
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] }, { body: contextRef.current });
    setInput('');
  };

  const firstName = repData?.rep_name.split(' ')[0] ?? null;

  return (
    <>
      {/* Account selector strip */}
      {repData && repData.accounts.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border)', padding: '8px 16px', background: 'var(--bg-strip)', flexShrink: 0 }}>
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Working on:</span>
            <select
              value={selectedAccountIdx ?? ''}
              onChange={e => setSelectedAccountIdx(e.target.value !== '' ? Number(e.target.value) : null)}
              style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">Select account for personalized tips...</option>
              {repData.accounts.map((a, i) => <option key={i} value={i}>{a.name} — {a.activation_status}</option>)}
            </select>
            {selected && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {selected.city}, {selected.state}
                {selected.current_booking_platform && selected.current_booking_platform !== 'None' ? ` · on ${selected.current_booking_platform}` : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {repData && (
                <div className="glow-card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    {repData.slack_photo && (
                      <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--accent-glow)', flexShrink: 0 }}>
                        <img src={repData.slack_photo} alt={firstName ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15, marginBottom: 3 }}>
                        {getDailyContent(new Date()).greeting}, {firstName}
                      </p>
                      {(repData.title || repData.region) && (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
                          {repData.title && <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'monospace', background: 'var(--accent-light)', border: '1px solid var(--accent-glow)', borderRadius: 5, padding: '1px 7px' }}>{repData.title}</span>}
                          {repData.region && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace', background: 'var(--bg-strip)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 7px' }}>{repData.region}</span>}
                        </div>
                      )}
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {repData.accounts.length === 1 ? `1 account in your pipeline.` : `${repData.accounts.length} accounts in your pipeline.`}{' '}
                        {selected ? `Working on ${selected.name}.` : 'Select an account above for a personalized pitch.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', padding: '0 2px' }}>Try asking</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(selected && mode === 'ask' ? [
                  `What's the best pitch for ${selected.name}?`,
                  ...SUGGESTIONS[mode].slice(1),
                ] : SUGGESTIONS[mode]).map(s => (
                  <button key={s} onClick={() => submit(s)} className="chip" style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, fontSize: 12 }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, msgIdx) => {
            const rawText = msg.parts.filter(p => p.type === 'text').map(p => (p as { type: 'text'; text: string }).text).join('');
            const isLastAI = msg.role === 'assistant' && !isLoading && messages.slice(msgIdx + 1).every(m => m.role !== 'assistant');
            const { display, suggestions } = msg.role === 'assistant' ? parseSuggestions(rawText) : { display: rawText, suggestions: [] };

            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', width: '100%' }}>
                  {msg.role === 'assistant' && (
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginRight: 8, marginTop: 2, flexShrink: 0,
                    }}>
                      <ToastFlame size={14} />
                    </div>
                  )}
                  <div style={{
                    maxWidth: '82%',
                    ...(msg.role === 'user'
                      ? {
                          background: 'var(--accent)', color: 'var(--accent-text)',
                          borderRadius: '16px 16px 4px 16px',
                          padding: '10px 14px', fontSize: 13,
                        }
                      : {
                          background: 'var(--bubble-ai)', border: '1px solid var(--bubble-ai-border)',
                          borderLeft: '2px solid var(--accent)',
                          borderRadius: '0 16px 16px 16px',
                          padding: '12px 16px',
                        }
                    ),
                  }}>
                    {msg.role === 'user' ? <span style={{ fontSize: 13 }}>{display}</span> : <Markdown text={display} />}
                  </div>
                </div>

                {isLastAI && suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, marginLeft: 36 }}>
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => submit(s)} className="chip">{s}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ToastFlame size={14} />
              </div>
              <div style={{ background: 'var(--bubble-ai)', border: '1px solid var(--bubble-ai-border)', borderLeft: '2px solid var(--accent)', borderRadius: '0 16px 16px 16px', padding: '12px 16px', display: 'flex', gap: 4, alignItems: 'center' }}>
                <span className="bounce-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', display: 'inline-block' }} />
                <span className="bounce-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', display: 'inline-block' }} />
                <span className="bounce-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', display: 'inline-block' }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', flexShrink: 0, background: 'var(--bg-header)' }}>
        <form onSubmit={e => { e.preventDefault(); submit(input); }} style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 8 }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            placeholder={mode === 'ask' ? 'Ask about features, objections, or customer examples...' : 'Ask me to teach you anything about Toast Tables...'}
            className="themed-input"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="btn-primary" style={{ padding: '10px 18px', flexShrink: 0 }}>
            Send
          </button>
        </form>
      </div>
    </>
  );
}

// ── ROI Calculator ─────────────────────────────────────────────────────────
function ROICalculator() {
  const [otTier, setOtTier] = useState<OtTierKey>('core');
  const [monthlyCovers, setMonthlyCovers] = useState<number>(2000);
  const [locations, setLocations] = useState<number>(1);
  const [category, setCategory] = useState<CategoryKey>('casual_dining');
  const [hasEM, setHasEM] = useState(false);
  const [hasAds, setHasAds] = useState(false);
  const [showInternal, setShowInternal] = useState(true);

  const tier = OT_TIERS[otTier];
  const cat = RWG_BY_CATEGORY[category];

  // Section 1: Cost Relief
  const otMonthlyPerLoc = tier.monthlyBase + monthlyCovers * tier.perCover;
  const otAnnualPerLoc = otMonthlyPerLoc * 12;
  const tablesAnnualPerLoc = TABLES_MONTHLY * 12;
  const savingsPerLoc = otAnnualPerLoc - tablesAnnualPerLoc;
  const totalSavings = savingsPerLoc * locations;

  // Section 2: Day 1 demand gen (observed)
  const rwgMonthly = cat.avgMonthly;
  const localMonthly = TOAST_LOCAL_MONTHLY_AVG;
  const avgCheck = cat.avgCheck;
  const rwgMonthlyValue = rwgMonthly * avgCheck;
  const localMonthlyValue = localMonthly * avgCheck;

  // Section 3: Aspirational demand gen
  const emMonthlyLift = hasEM ? Math.round(rwgMonthly * EM_LIFT_PCT) : 0;
  const emMonthlyValue = emMonthlyLift * avgCheck;
  const adsCPA = (ADS_CPA_LOW + ADS_CPA_HIGH) / 2;
  const adsBookings = hasAds ? Math.round(ADS_MONTHLY_SPEND_DEFAULT / adsCPA) : 0;
  const adsMonthlyValue = adsBookings * avgCheck;

  // Section 4: Net position (annual)
  const observedAnnualDemandValue = (rwgMonthlyValue + localMonthlyValue) * 12 * locations;
  const assumedAnnualDemandValue = (emMonthlyValue + adsMonthlyValue) * 12 * locations;
  const totalAnnualValue = totalSavings + observedAnnualDemandValue + (showInternal ? assumedAnnualDemandValue : 0);

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString();
  const fmtDec = (n: number) => n.toFixed(1);

  const s: React.CSSProperties = {
    fontFamily: 'inherit',
    fontSize: 13,
    color: 'var(--text-primary)',
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };
  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-strip)', border: '1px solid var(--border)', borderRadius: 6,
    padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13, width: '100%',
  };
  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-strip)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 16, marginBottom: 14,
  };
  const headingStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 0', borderBottom: '1px solid var(--border)',
  };
  const bigNum: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: 'var(--accent)' };
  const assumedBadge = (label: string) => showInternal ? (
    <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.12)', color: '#d97706', padding: '1px 6px', borderRadius: 4, marginLeft: 6, fontWeight: 600 }}>{label}</span>
  ) : null;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px', ...s }}>
      {/* Header + toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>ROI Calculator</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Answer: "What does Toast send us?"</div>
        </div>
        <button
          onClick={() => setShowInternal(v => !v)}
          style={{
            background: showInternal ? 'rgba(255,76,0,0.12)' : 'var(--bg-strip)',
            border: '1px solid var(--border)', borderRadius: 20, padding: '4px 12px',
            fontSize: 11, fontWeight: 600, color: showInternal ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          {showInternal ? 'Internal view' : 'Customer view'}
        </button>
      </div>

      {/* Inputs */}
      <div style={{ ...sectionStyle }}>
        <div style={headingStyle}>Prospect details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Current platform</label>
            <select style={inputStyle} value={otTier} onChange={e => setOtTier(e.target.value as OtTierKey)}>
              {(Object.entries(OT_TIERS) as [OtTierKey, typeof OT_TIERS[OtTierKey]][]).map(([k, v]) => (
                <option key={k} value={k}>OpenTable {v.label} (${v.monthlyBase}/mo + ${v.perCover}/cover)</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Monthly covers (approx)</label>
            <input type="number" min={100} step={100} style={inputStyle} value={monthlyCovers}
              onChange={e => setMonthlyCovers(Math.max(0, parseInt(e.target.value) || 0))} />
          </div>
          <div>
            <label style={labelStyle}>Restaurant category</label>
            <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value as CategoryKey)}>
              {(Object.entries(RWG_BY_CATEGORY) as [CategoryKey, typeof RWG_BY_CATEGORY[CategoryKey]][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Locations</label>
            <input type="number" min={1} max={20} style={inputStyle} value={locations}
              onChange={e => setLocations(Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
        </div>
      </div>

      {/* Section 1: Cost relief */}
      <div style={sectionStyle}>
        <div style={headingStyle}>
          <span>1. COST RELIEF</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'none', letterSpacing: 0, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 10 }}>PUBLIC PRICING</span>
        </div>
        <div style={rowStyle}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>OpenTable annual cost {locations > 1 ? `(per location)` : ''}</span>
          <span style={{ fontWeight: 600 }}>{fmt(otAnnualPerLoc)}/yr</span>
        </div>
        <div style={rowStyle}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Toast Tables annual cost</span>
          <span style={{ fontWeight: 600 }}>{fmt(tablesAnnualPerLoc)}/yr</span>
        </div>
        {locations > 1 && (
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Locations</span>
            <span style={{ fontWeight: 600 }}>{locations}x</span>
          </div>
        )}
        <div style={{ paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Total annual savings</span>
          <span style={bigNum}>{fmt(totalSavings)}/yr</span>
        </div>
        {showInternal && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Formula: ({fmt(tier.monthlyBase)} + {monthlyCovers.toLocaleString()} covers x ${tier.perCover}) x 12 = {fmt(otAnnualPerLoc)} OT vs {fmt(tablesAnnualPerLoc)} Tables
          </div>
        )}
      </div>

      {/* Section 2: Day 1 demand gen */}
      <div style={sectionStyle}>
        <div style={headingStyle}>
          <span>2. DEMAND GEN — DAY ONE</span>
          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600, textTransform: 'none', letterSpacing: 0, background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 10 }}>OBSERVED</span>
        </div>
        <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(255,76,0,0.05)', borderRadius: 6, border: '1px solid rgba(255,76,0,0.15)', fontSize: 11, color: 'var(--text-secondary)' }}>
          Only ~{Math.round(OT_NETWORK_PCT * 100)}% of OT bookings come from OT's own app. The rest is organic, Google, and direct — Toast Tables replaces that on day one.
          {showInternal && <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>[CITED: SevenRooms 2023 State of Restaurant Reservations]</span>}
        </div>
        <div style={rowStyle}>
          <div>
            <span style={{ fontSize: 12 }}>Reserve with Google</span>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Based on {fmtDec(rwgMonthly)} avg/month for {cat.label} on Toast{showInternal ? ' (Snowflake observed, Q1 2026)' : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600 }}>{fmtDec(rwgMonthly)} bookings/mo</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmt(rwgMonthlyValue)}/mo at ${avgCheck} avg check</div>
          </div>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <div>
            <span style={{ fontSize: 12 }}>Toast Local (toast.app)</span>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>National avg, growing post-Jun redirect</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600 }}>{fmtDec(localMonthly)} bookings/mo</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmt(localMonthlyValue)}/mo at ${avgCheck} avg check</div>
          </div>
        </div>
        <div style={{ paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Day 1 demand value{locations > 1 ? ` (${locations} locations)` : ''}</span>
          <span style={{ ...bigNum, color: '#10b981' }}>{fmt(observedAnnualDemandValue)}/yr</span>
        </div>
      </div>

      {/* Section 3: Aspirational demand gen */}
      <div style={sectionStyle}>
        <div style={headingStyle}>
          <span>3. DEMAND GEN — INVEST</span>
          {showInternal && <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600, textTransform: 'none', letterSpacing: 0, background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 10 }}>ASPIRATIONAL</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={hasEM} onChange={e => setHasEM(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            Email marketing
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={hasAds} onChange={e => setHasAds(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            Toast Ads
          </label>
        </div>
        {!hasEM && !hasAds && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Select an option above to model additional demand gen.</div>
        )}
        {hasEM && (
          <div style={rowStyle}>
            <div>
              <span style={{ fontSize: 12 }}>Email marketing to guest list{assumedBadge('+15% ASSUMED')}</span>
              {showInternal && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Industry benchmark (Klaviyo/SevenRooms) — no internal Snowflake data</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600 }}>+{emMonthlyLift} bookings/mo</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmt(emMonthlyValue)}/mo</div>
            </div>
          </div>
        )}
        {hasAds && (
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <div>
              <span style={{ fontSize: 12 }}>Toast Ads at ${ADS_MONTHLY_SPEND_DEFAULT}/mo{assumedBadge('$8-12 CPA DIRECTIONAL')}</span>
              {showInternal && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No internal ROAS data — directional only</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600 }}>~{adsBookings} bookings/mo</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmt(adsMonthlyValue)}/mo</div>
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Net position */}
      <div style={{ ...sectionStyle, background: 'rgba(255,76,0,0.05)', border: '1px solid rgba(255,76,0,0.25)' }}>
        <div style={{ ...headingStyle, color: 'var(--text-primary)' }}>TOTAL ANNUAL VALUE</div>
        <div style={rowStyle}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cost savings</span>
          <span style={{ fontWeight: 600 }}>{fmt(totalSavings)}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Day 1 demand gen value</span>
          <span style={{ fontWeight: 600 }}>{fmt(observedAnnualDemandValue)}</span>
        </div>
        {showInternal && (hasEM || hasAds) && (
          <div style={rowStyle}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Aspirational demand gen{assumedBadge('ASSUMED/DIRECTIONAL')}</span>
            <span style={{ fontWeight: 600 }}>{fmt(assumedAnnualDemandValue)}</span>
          </div>
        )}
        <div style={{ paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>Est. annual impact</span>
          <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)' }}>{fmt(totalAnnualValue)}/yr</span>
        </div>
        {!showInternal && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,76,0,0.2)', fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
            Estimates based on cost savings vs. public OpenTable pricing and observed Google RwG booking data across Toast Tables restaurants. Actual results vary. Demand gen figures are directional and not guaranteed. Toast Tables pricing is $199/month.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('ask');
  const [repData, setRepData] = useState<RepData | null>(null);
  const [selectedAccountIdx, setSelectedAccountIdx] = useState<number | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [activeTheme, setActiveTheme] = useState<Theme>(() => getThemeForDate(new Date()));

  const repEmail = session?.user?.email ?? null;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Load persisted preferences
  useEffect(() => {
    const dark = localStorage.getItem('rep_dark') === '1';
    const themeId = localStorage.getItem('rep_theme');
    setIsDark(dark);
    if (themeId) {
      const t = THEMES.find(t => t.id === themeId);
      if (t) setActiveTheme(t);
    }
  }, []);

  // Apply theme + mode whenever either changes
  useEffect(() => {
    applyTheme(activeTheme, isDark);
  }, [activeTheme, isDark]);

  useEffect(() => {
    if (!repEmail) return;
    fetch(`/api/accounts?email=${encodeURIComponent(repEmail)}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setRepData(d as RepData); })
      .catch(() => {});
  }, [repEmail]);

  const toggleDark = useCallback(() => {
    setIsDark(d => { localStorage.setItem('rep_dark', d ? '0' : '1'); return !d; });
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setActiveTheme(t);
    localStorage.setItem('rep_theme', t.id);
  }, []);

  const firstName = repData?.rep_name.split(' ')[0];

  // Show spinner while session loads
  if (status === 'loading' || status === 'unauthenticated') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #FF4C00', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const TAB_LABELS: Record<Mode, string> = { ask: 'Ask', train: 'Train', roi: 'ROI', prep: 'Prep', accounts: 'Pipeline', proof: 'Proof' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-page)' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)', padding: '10px 16px',
        background: 'var(--bg-header)', flexShrink: 0,
        boxShadow: '0 1px 0 var(--border)',
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {/* Left: wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--accent-light)', border: '1px solid var(--accent-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ToastFlame size={15} />
            </div>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Tables <span style={{ color: 'var(--accent)' }}>Rep</span>
              </span>
              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-strip)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 6px', fontFamily: 'monospace' }}>Jul 2026</span>
            </div>
            {/* Active exec badge */}
            {activeTheme.exec && <ExecBadge exec={activeTheme.exec} />}
          </div>

          {/* Center: tabs */}
          <div className="tab-bar">
            {(['ask', 'train', 'roi', 'prep', 'accounts', 'proof'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`tab-btn${mode === m ? ' active' : ''}`}>
                {TAB_LABELS[m]}
              </button>
            ))}
          </div>

          {/* Right: rep + theme controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {(firstName || session?.user?.image) && (
              <button
                title={`Signed in as ${repEmail ?? ''} — click to sign out`}
                onClick={() => signOut({ callbackUrl: '/login' })}
                style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', border: '2px solid var(--border)', cursor: 'pointer', padding: 0 }}
              >
                {repData?.slack_photo
                  ? <img src={repData.slack_photo} alt={firstName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : session?.user?.image
                  ? <img src={session.user.image} alt={firstName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-text)' }}>{(firstName ?? repEmail ?? '?')[0].toUpperCase()}</span>
                }
              </button>
            )}
            <ThemePicker activeTheme={activeTheme} isDark={isDark} onTheme={setTheme} onToggleDark={toggleDark} />
          </div>
        </div>
      </header>

      {/* Content */}
      {mode === 'accounts' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            {repData ? <AccountsTab data={repData} /> : (
              <div style={{ paddingTop: 48, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No data for <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-strip)', padding: '1px 6px', borderRadius: 4 }}>{repEmail}</code>.</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>Ask Dan to run <code style={{ fontFamily: 'monospace', fontSize: 10 }}>seed_rep_accounts.py</code></p>
              </div>
            )}
          </div>
        </div>
      ) : mode === 'prep' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <PrepTab repData={repData} selectedAccountIdx={selectedAccountIdx} setSelectedAccountIdx={setSelectedAccountIdx} />
          </div>
        </div>
      ) : mode === 'roi' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ROICalculator />
        </div>
      ) : mode === 'proof' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ borderBottom: '1px solid var(--border)', padding: '8px 16px', background: 'var(--bg-strip)', flexShrink: 0 }}>
            <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Customer Proof</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Real restaurants using Toast Tables — by category</p>
              </div>
              <a href="https://www.magicpatterns.com/c/85kpuhe3owkyfvqsjfwmus" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                Open full screen ↗
              </a>
            </div>
          </div>
          <iframe src="https://01df6993-d785-4918-bacc-6c42c622de8f-render.magicpatterns.app/" style={{ flex: 1, width: '100%', border: 'none' }} title="Rep Assist Proof Slides" allow="fullscreen" />
        </div>
      ) : (
        <ChatPane key={mode} mode={mode as 'ask' | 'train'} repData={repData} selectedAccountIdx={selectedAccountIdx} setSelectedAccountIdx={setSelectedAccountIdx} />
      )}
    </div>
  );
}
