'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { RepContext, AccountContext } from '@/lib/platform-types';
import { isCollectorComplete, saveCollectorAnswers, loadCollectorAnswers } from '@/lib/collector';
import { TabShell } from '@/components/platform/TabShell';
import type { NavTab } from '@/components/platform/MobileNav';
import {
  OT_TIERS, TABLES_MONTHLY, RWG_BY_CATEGORY, TOAST_LOCAL_MONTHLY_AVG,
  EM_LIFT_PCT, ADS_CPA_LOW, ADS_CPA_HIGH, ADS_MONTHLY_SPEND_DEFAULT, OT_NETWORK_PCT,
  type OtTierKey, type CategoryKey,
} from '@/lib/roi-data';

type Mode = 'home' | 'ask' | 'train' | 'prep' | 'roi' | 'accounts' | 'proof' | 'listen' | 'workflows';

// ── Toast flame SVG ────────────────────────────────────────────────────────
function ToastFlame({ size = 16, className = '', accent }: { size?: number; className?: string; accent?: string }) {
  const fill = accent ?? 'var(--accent, #FF4C00)';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M18 50 Q18 42 26 42 L74 42 Q82 42 82 50 L82 80 Q82 86 76 86 L24 86 Q18 86 18 80 Z" fill={fill} opacity="0.22" />
      <path d="M30 42 Q30 22 50 22 Q70 22 70 42" stroke={fill} strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.65" />
      <path d="M21 44 L79 44" stroke={fill} strokeWidth="3.5" strokeLinecap="round" opacity="0.5" />
      <path fillRule="evenodd" clipRule="evenodd" d="M50 30C50 30 62 44 62 55C62 62 58 68 52 71C53.5 67 52 62 48 60C48 60 51 54.5 46.5 47C46.5 47 45 56 39 61C35 57 35 52 35 52C35 52 30 58 33 66C28 63 26 57 26 52C26 38 38 32 50 30Z" fill={fill} />
      <line x1="31" y1="62" x2="69" y2="62" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.15" />
      <line x1="31" y1="73" x2="69" y2="73" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.10" />
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
interface ProductHealth {
  product: string;
  status: 'live_healthy' | 'live_stalled' | 'live_at_risk' | 'purchased_not_activated' | 'not_purchased';
  purchased_date?: string;
  last_activity_date?: string;
  notes?: string;
}
interface Account {
  name: string; city: string; state: string;
  signed_date: string; activation_status: string; is_activated: boolean;
  bookings_90d: number; covers_90d: number; last_booking_date: string | null;
  monthly_trend: { month: string; bookings: number; covers: number }[];
  chorus_calls?: ChorusCall[];
  current_booking_platform?: string;
  note?: string;
  products?: ProductHealth[];
  days_since_touchpoint?: number;
  days_since_rep_contact?: number;
  last_contact_date?: string;
  open_support_tickets?: number;
  case_data?: {
    case_count_90d: number;
    open_cases: number;
    escalated_cases: number;
    days_since_last_case: number;
    top_case_category: string;
    case_subjects: string[];
  };
  flare_signals?: string[];
  account_grade?: string;
  account_profitability_bucket?: string;
  total_arr?: number;
  renewal_date?: string;
  account_health?: 'healthy' | 'at_risk' | 'cancel_risk';
  locations?: number;
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
    covers_90d: acct.covers_90d,
    is_activated: acct.is_activated,
    signed_date: acct.signed_date,
    monthly_trend: acct.monthly_trend,
    products: acct.products,
    days_since_touchpoint: acct.days_since_touchpoint,
    days_since_rep_contact: acct.days_since_rep_contact,
    open_support_tickets: acct.case_data?.open_cases ?? acct.open_support_tickets,
    case_data: acct.case_data,
    flare_signals: acct.flare_signals,
    account_grade: acct.account_grade,
    total_arr: acct.total_arr,
    renewal_date: acct.renewal_date,
    account_health: acct.account_health,
    locations: acct.locations,
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
  if (match) {
    return {
      display: text.replace(/<suggestions>[\s\S]*?<\/suggestions>/, '').trimEnd(),
      suggestions: match[1].split('\n').map(s => s.trim()).filter(Boolean),
    };
  }
  // Strip in-progress <suggestions> block during streaming (closing tag not yet arrived)
  const partialIdx = text.indexOf('<suggestions>');
  if (partialIdx !== -1) {
    return { display: text.slice(0, partialIdx).trim(), suggestions: [] };
  }
  return { display: text, suggestions: [] };
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

// ── Chat history utils ─────────────────────────────────────────────────────
function chatHistoryKey(repName: string, mode: string) {
  return `rep_chat_${mode}_${repName}`;
}

function saveChatHistory(repName: string, mode: string, messages: { role: string; text: string }[]) {
  try {
    localStorage.setItem(chatHistoryKey(repName, mode), JSON.stringify({
      messages: messages.slice(-20),
      savedAt: new Date().toISOString(),
    }));
  } catch {}
}

function loadChatHistory(repName: string, mode: string): { messages: { role: string; text: string }[]; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(chatHistoryKey(repName, mode));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

// ── Confetti burst ─────────────────────────────────────────────────────────
function ConfettiBurst({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    if (visible) { const t = setTimeout(() => onDoneRef.current(), 2200); return () => clearTimeout(t); }
  }, [visible]);
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
  { icon: '1', label: 'Pick an account', detail: 'Go to Accounts, select a customer.' },
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

// ── Live Call / Listen tab ─────────────────────────────────────────────────
interface ListenInsight {
  id: string;
  type: 'objection' | 'question' | 'signal' | 'answer';
  trigger: string;
  response: string;
  timestamp: number;
}

// Quick lookup - heard keyword → canned response card while AI generates
const QUICK_TRIGGERS: { keywords: string[]; type: ListenInsight['type']; trigger: string; response: string }[] = [
  { keywords: ['opentable', 'open table'], type: 'objection', trigger: 'OpenTable comparison', response: 'Toast Tables: $0 cover fee vs OT $1.50-$2.50/cover. Guest data stays with the restaurant, not OpenTable. Same-night orders available, OT is reservations-only.' },
  { keywords: ['resy'], type: 'objection', trigger: 'Resy comparison', response: 'Resy: strong NYC/fine dining. Tables: broader coverage + POS integration + same-night OO. Resy has no ordering. Pricing similar but no cover fee on Tables.' },
  { keywords: ['how much', 'cost', 'price', 'pricing'], type: 'question', trigger: 'Pricing question', response: '$249/mo base. No per-cover fee. No contract required. OT equivalent would be $249 + $1.50-2.50/cover - at 500 covers/mo that\'s $1,000+/mo vs $249.' },
  { keywords: ['google', 'reserve with google', 'rwg'], type: 'question', trigger: 'Reserve with Google', response: 'Tables is a Reserve with Google partner. Guests book directly from Google Search/Maps. No extra setup - it\'s included.' },
  { keywords: ['setup', 'onboarding', 'how long'], type: 'question', trigger: 'Setup timeline', response: 'Live in 1-2 weeks typically. OC walks through floor plan, schedule, service areas. Config Checker runs weekly to catch issues before they become problems.' },
  { keywords: ['cancel', 'contract', 'lock in', 'locked in'], type: 'objection', trigger: 'Contract / cancel', response: 'No long-term contract required. Month-to-month available. Restaurants stay because it works, not because they\'re locked in.' },
  { keywords: ['deposit', 'pre-pay', 'prepay', 'credit card'], type: 'question', trigger: 'Deposits / prepayment', response: 'Tables supports deposits and prepayment natively. Restaurant sets the policy. Guest pays at booking. Integrated with Toast Payments - no third-party processor needed.' },
  { keywords: ['waitlist'], type: 'question', trigger: 'Waitlist', response: 'Tables has a native waitlist. Guests join from the host app or the website widget. SMS notifications when table is ready. No separate subscription.' },
  { keywords: ['widget', 'website', 'embed'], type: 'question', trigger: 'Website widget', response: 'Embeddable booking widget for their site - copy/paste one line of code. Works on any website platform. Direct bookings = no third-party fee.' },
  { keywords: ['data', 'guest data', 'crm', 'guestbook'], type: 'signal', trigger: 'Guest data / CRM interest', response: 'Guestbook: every reservation builds a guest profile. Visit history, preferences, dietary notes. Restaurant owns the data - it never goes to a competitor marketplace.' },
];

function detectTriggers(transcript: string): typeof QUICK_TRIGGERS[0] | null {
  const lower = transcript.toLowerCase();
  for (const t of QUICK_TRIGGERS) {
    if (t.keywords.some(k => lower.includes(k))) return t;
  }
  return null;
}

function ListenTab({ repData }: { repData: RepData | null }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [insights, setInsights] = useState<ListenInsight[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [supported, setSupported] = useState(true);
  const [permError, setPermError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const recognitionRef = useRef<any>(null);
  const insightListRef = useRef<HTMLDivElement>(null);
  const seenTriggerKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); }
    return () => { recognitionRef.current?.stop(); };
  }, []);

  // Auto-scroll insights
  useEffect(() => {
    if (insightListRef.current) {
      insightListRef.current.scrollTop = insightListRef.current.scrollHeight;
    }
  }, [insights]);

  const addInsight = (ins: Omit<ListenInsight, 'id' | 'timestamp'>) => {
    setInsights(prev => [...prev, { ...ins, id: Date.now().toString(), timestamp: Date.now() }]);
  };

  const askAI = async (text: string) => {
    if (!text.trim() || aiLoading) return;
    setAiLoading(true);
    addInsight({ type: 'signal', trigger: 'Heard', response: text.trim().slice(0, 120) + (text.length > 120 ? '...' : '') });
    try {
      const repContext = repData ? { rep_name: repData.rep_name, team: repData.team, region: repData.region } : undefined;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `LIVE CALL MODE. The prospect just said or asked: "${text.trim()}"\n\nGive me a concise 2-3 sentence response I can use RIGHT NOW. Lead with the key fact or reframe. No preamble.` }],
          repContext,
        }),
      });
      if (!res.ok) throw new Error('API error');
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      let answer = '';
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'text-delta') answer += parsed.delta ?? '';
              else if (typeof parsed === 'string') answer += parsed;
            } catch {}
          }
        }
      }
      if (answer.trim()) {
        addInsight({ type: 'answer', trigger: 'Suggested response', response: answer.trim() });
      }
    } catch {
      addInsight({ type: 'answer', trigger: 'Error', response: 'Could not reach AI - check connection.' });
    } finally {
      setAiLoading(false);
    }
  };

  const processPhrase = (phrase: string) => {
    const quick = detectTriggers(phrase);
    if (quick && !seenTriggerKeysRef.current.has(quick.trigger)) {
      seenTriggerKeysRef.current.add(quick.trigger);
      addInsight({ type: quick.type, trigger: quick.trigger, response: quick.response });
    }
    setTranscript(prev => (prev ? prev + ' ' + phrase : phrase).slice(-600));
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          processPhrase(e.results[i][0].transcript.trim());
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setInterimText(interim);
    };
    r.onerror = (e: any) => {
      if (e.error === 'not-allowed') setPermError('Microphone access denied. Allow microphone in browser settings.');
      else if (e.error !== 'no-speech') setPermError(`Recognition error: ${e.error}`);
    };
    r.onend = () => { setListening(false); setInterimText(''); };
    recognitionRef.current = r;
    r.start();
    setListening(true);
    setPermError(null);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText('');
  };

  const clearAll = () => {
    setInsights([]);
    setTranscript('');
    seenTriggerKeysRef.current.clear();
  };

  const typeColor: Record<ListenInsight['type'], string> = {
    objection: '#f59e0b',
    question: '#6366f1',
    signal: '#64748b',
    answer: 'var(--accent)',
  };
  const typeLabel: Record<ListenInsight['type'], string> = {
    objection: 'OBJECTION',
    question: 'QUESTION',
    signal: 'HEARD',
    answer: 'USE THIS',
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-strip)', flexShrink: 0 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Live Call Assist</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
              Type a short phrase from the call. Instant cards for 10+ known topics, AI for everything else.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {insights.length > 0 && (
              <button onClick={clearAll} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                Clear
              </button>
            )}
            {supported && (
              <button
                onClick={listening ? stopListening : startListening}
                title="Requires BlackHole or similar virtual audio device to hear both sides"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none',
                  border: `1px solid ${listening ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                  borderRadius: 8, padding: '6px 12px', fontSize: 11,
                  color: listening ? '#ef4444' : 'var(--text-tertiary)', cursor: 'pointer',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: listening ? '#ef4444' : 'var(--text-tertiary)', flexShrink: 0, animation: listening ? 'pulse-dot 1.2s ease-in-out infinite' : 'none' }} />
                {listening ? 'Stop mic' : 'Use mic'}
              </button>
            )}
          </div>
        </div>
        {listening && (
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 5, maxWidth: 720, margin: '5px auto 0', fontFamily: 'monospace' }}>
            Mic active - hears your voice only. To capture both sides, route Zoom audio through BlackHole (free, Mac).
          </p>
        )}
        {permError && (
          <p style={{ fontSize: 11, color: '#ef4444', marginTop: 6, maxWidth: 720, margin: '6px auto 0' }}>{permError}</p>
        )}
      </div>

      {/* Insights feed */}
      <div ref={insightListRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {insights.length === 0 && (
            <div style={{ paddingTop: 32, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Try typing one of these</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
                {['we use OpenTable', 'how much does it cost', 'can we do deposits', 'what about waitlist', 'how long to set up', 'no long-term contract?'].map(ex => (
                  <button key={ex} onClick={() => { setManualInput(ex); }} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 12px', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    {ex}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Cards appear instantly for known topics. AI fills in everything else.</p>
            </div>
          )}
          {insights.map(ins => (
            <div key={ins.id} style={{
              background: 'var(--bg-card)', border: `1px solid var(--border)`,
              borderLeft: `3px solid ${typeColor[ins.type]}`,
              borderRadius: '0 12px 12px 0', padding: '10px 14px',
              animation: 'slide-in-insight 0.2s ease-out',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: typeColor[ins.type], letterSpacing: '0.1em' }}>
                  {typeLabel[ins.type]}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                  {new Date(ins.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{ins.trigger}</p>
              <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{ins.response}</p>
              {ins.type === 'answer' && (
                <button
                  onClick={() => speakText(ins.response, 'en-US')}
                  style={{ marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  ▶ Read aloud
                </button>
              )}
            </div>
          ))}
          {aiLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,1,2].map(i => <span key={i} className="bounce-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />)}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Generating response...</span>
            </div>
          )}
          {listening && interimText && (
            <div style={{ padding: '8px 14px', background: 'rgba(255,76,0,0.04)', border: '1px dashed rgba(255,76,0,0.2)', borderRadius: 8 }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{interimText}</p>
            </div>
          )}
        </div>
      </div>

      {/* Manual input - primary path */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--bg-header)', flexShrink: 0 }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <form onSubmit={e => { e.preventDefault(); if (manualInput.trim()) { askAI(manualInput); setManualInput(''); } }} style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualInput} onChange={e => setManualInput(e.target.value)}
              placeholder='What did they say? e.g. "we already use OpenTable" or "how much does it cost"'
              className="themed-input"
              style={{ fontSize: 14 }}
              disabled={aiLoading}
              autoFocus
            />
            <button type="submit" disabled={aiLoading || !manualInput.trim()} className="btn-primary" style={{ padding: '10px 20px', flexShrink: 0, fontSize: 13 }}>
              {aiLoading ? '...' : 'Get response'}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes slide-in-insight {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}

// ── Attach Intel Panel ─────────────────────────────────────────────────────
interface AttachProduct {
  key: string;
  name: string;
  myPct: number | null;
  myAttached: number | null;
  totalAccts: number | null;
  medianPct: number;
  topDecilePct: number;
  gapToMedian: number | null;
  gapToTopDecile: number | null;
}

interface AttachIntelData {
  enabled: boolean;
  refMonth?: string;
  amCount?: number;
  totalAccts?: number | null;
  products?: AttachProduct[];
}

// Maps attach-intel product keys to the product name used in rep-accounts.json
const ATTACH_KEY_TO_PRODUCT: Record<string, string> = {
  oo: 'Websites + Online Ordering',
  xc: 'xtraCHEF',
  mkt: 'Toast Marketing',
};

function AttachIntelPanel({ repEmail, onShowGapAccounts }: {
  repEmail: string;
  onShowGapAccounts: (productName: string) => void;
}) {
  const [data, setData] = useState<AttachIntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetch(`/api/attach-intel?email=${encodeURIComponent(repEmail)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [repEmail]);

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em',
    fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600, marginBottom: 8,
  };

  if (loading) {
    return (
      <div>
        <p style={labelStyle}>Attach rates</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ ...cardStyle, height: 80, opacity: 0.4, background: 'var(--border)', borderRadius: 12 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.enabled || !data?.products) return null;

  const refLabel = data.refMonth
    ? new Date(data.refMonth + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ ...labelStyle, marginBottom: 0 }}>Your attach rates vs. peers</p>
        {refLabel && <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{refLabel}</p>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {data.products.map(p => {
          const hasPersonal = p.myPct !== null;
          const aboveMedian = hasPersonal && p.gapToMedian !== null && p.gapToMedian >= 0;
          const nearTopDecile = hasPersonal && p.myPct !== null && p.myPct >= p.topDecilePct * 0.9;
          const bigGap = hasPersonal && p.gapToMedian !== null && p.gapToMedian < -10;

          const pctColor = nearTopDecile ? '#10b981' : aboveMedian ? '#f59e0b' : bigGap ? '#ef4444' : '#f59e0b';
          const barFill = hasPersonal && p.myPct !== null ? Math.min(p.myPct / 100, 1) : 0;
          const medianFill = Math.min(p.medianPct / 100, 1);
          const p90Fill = Math.min(p.topDecilePct / 100, 1);

          return (
            <div key={p.key} style={{ ...cardStyle }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500 }}>{p.name}</p>
              {hasPersonal ? (
                <>
                  <p style={{ fontSize: 22, fontWeight: 700, color: pctColor, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                    {p.myPct}%
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
                    {p.myAttached}/{p.totalAccts} accounts
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.4 }}>
                  Your data syncs<br />when your book loads
                </p>
              )}
              {/* Progress bar */}
              <div style={{ position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 8 }}>
                {/* p90 marker */}
                <div style={{ position: 'absolute', left: `${p90Fill * 100}%`, top: -2, width: 2, height: 8, background: 'rgba(100,116,139,0.5)', borderRadius: 1 }} />
                {/* median marker */}
                <div style={{ position: 'absolute', left: `${medianFill * 100}%`, top: -1, width: 2, height: 6, background: 'rgba(100,116,139,0.8)', borderRadius: 1 }} />
                {/* fill */}
                {hasPersonal && (
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${barFill * 100}%`, background: pctColor, borderRadius: 2, opacity: 0.8 }} />
                )}
              </div>
              {/* Gap label */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                {hasPersonal && p.gapToMedian !== null ? (
                  <p style={{ fontSize: 9, color: aboveMedian ? '#10b981' : '#f59e0b', fontFamily: 'monospace' }}>
                    {p.gapToMedian >= 0 ? '+' : ''}{p.gapToMedian}pp vs typical AM
                  </p>
                ) : (
                  <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                    typical AM: {p.medianPct}%
                  </p>
                )}
                <p style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                  best: {p.topDecilePct}%
                </p>
              </div>
              {/* CTA: only when below median and product maps to accounts */}
              {hasPersonal && !aboveMedian && ATTACH_KEY_TO_PRODUCT[p.key] && (
                <button
                  onClick={() => onShowGapAccounts(ATTACH_KEY_TO_PRODUCT[p.key])}
                  style={{ marginTop: 8, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer', fontSize: 10, fontWeight: 600, padding: '3px 8px', width: '100%', textAlign: 'left' }}
                >
                  See accounts without {p.name} &rarr;
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 6 }}>
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Comparing {data.amCount} AMs with 10+ Tables accounts</p>
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', opacity: 0.7 }}>No peer names shared</p>
      </div>
    </div>
  );
}

// ── Home tab ───────────────────────────────────────────────────────────────
interface ActionItem { id: string; text: string; done: boolean; }

const ONBOARDING_WEEKS: { label: string; items: { id: string; text: string; mode?: Mode }[] }[] = [
  {
    label: 'Week 1 - Learn the product',
    items: [
      { id: 'ob1', text: 'Complete your first mock pitch in Train mode', mode: 'train' },
      { id: 'ob2', text: 'Ask the AI: "What are the top 3 OpenTable objections?"', mode: 'ask' },
      { id: 'ob3', text: 'Run the ROI calculator with a real prospect in mind', mode: 'roi' },
    ],
  },
  {
    label: 'Week 2 - Work your pipeline',
    items: [
      { id: 'ob4', text: 'Generate a prep brief before your first real call', mode: 'prep' },
      { id: 'ob5', text: 'Review customer proof by category', mode: 'proof' },
      { id: 'ob6', text: 'Ask the AI: "How do I handle a prospect that says they\'re happy with Resy?"', mode: 'ask' },
    ],
  },
  {
    label: 'Weeks 3-4 - Close your first deal',
    items: [
      { id: 'ob7', text: 'Run a mock call with a live objection in Train mode', mode: 'train' },
      { id: 'ob8', text: 'Use Live mode on a real Zoom call', mode: 'listen' },
      { id: 'ob9', text: 'Build your first ROI deck for an open opportunity', mode: 'roi' },
    ],
  },
];

function HomeTab({ repData, repEmail, streak, onNav, onPrepAccount, onShowGapAccounts }: {
  repData: RepData | null;
  repEmail: string | null;
  streak: number;
  onNav: (mode: Mode) => void;
  onPrepAccount: (idx: number) => void;
  onShowGapAccounts: (productName: string) => void;
}) {
  const daily = getDailyContent(new Date());
  const firstName = repData?.rep_name.split(' ')[0] ?? '';
  const daysIn = repData ? daysSince(repData.seeded_at) : 0;
  const isOnboarding = daysIn < 30;
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [newAction, setNewAction] = useState('');
  const [obDone, setObDone] = useState<Record<string, boolean>>({});
  const obKey = `ob_progress_${repData?.rep_name ?? 'default'}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(obKey);
      if (stored) setObDone(JSON.parse(stored));
    } catch {}
  }, [obKey]);

  const toggleOb = (id: string) => {
    const updated = { ...obDone, [id]: !obDone[id] };
    setObDone(updated);
    try { localStorage.setItem(obKey, JSON.stringify(updated)); } catch {}
  };
  const actionsKey = `rep_actions_${repData?.rep_name ?? 'default'}`;

  useEffect(() => {
    // Always migrate from 'default' key to real rep key if present
    if (actionsKey !== 'rep_actions_default') {
      try {
        const migrated = localStorage.getItem('rep_actions_default');
        if (migrated) {
          localStorage.setItem(actionsKey, migrated);
          localStorage.removeItem('rep_actions_default');
        }
      } catch {}
    }
    try {
      const stored = localStorage.getItem(actionsKey);
      if (stored) { setActions(JSON.parse(stored)); return; }
    } catch {}
    // Only seed defaults if nothing is stored - this branch only runs once per rep
    if (isOnboarding) {
      setActions([
        { id: '1', text: 'Complete your first mock pitch in Train mode', done: false },
        { id: '2', text: 'Generate a prep brief for your first account', done: false },
        { id: '3', text: 'Review the ROI calculator with a real prospect in mind', done: false },
        { id: '4', text: 'Read the competitive objection guide for OpenTable', done: false },
      ]);
    } else {
      setActions([
        { id: '1', text: 'Review pipeline before end of week', done: false },
        { id: '2', text: 'Generate prep briefs for this week\'s calls', done: false },
        { id: '3', text: 'Log outcomes from last week\'s activations', done: false },
      ]);
    }
  }, [actionsKey]); // intentionally omit isOnboarding - only re-run when key changes, not on every render

  const saveActions = (updated: ActionItem[]) => {
    setActions(updated);
    try { localStorage.setItem(actionsKey, JSON.stringify(updated)); } catch {}
  };

  const toggleAction = (id: string) => saveActions(actions.map(a => a.id === id ? { ...a, done: !a.done } : a));
  const deleteAction = (id: string) => saveActions(actions.filter(a => a.id !== id));
  const addAction = () => {
    if (!newAction.trim()) return;
    const item: ActionItem = { id: Date.now().toString(), text: newAction.trim(), done: false };
    saveActions([...actions, item]);
    setNewAction('');
  };

  const activated = repData?.accounts.filter(a => a.is_activated).length ?? 0;
  const total = repData?.accounts.length ?? 0;
  // Cold: use best available signal (TASK_ACTIVITY primary, Chorus fallback)
  const coldAccounts = repData?.accounts.filter(a => {
    const dstSf = a.days_since_rep_contact ?? 9999;
    const dstChorus = a.days_since_touchpoint ?? 9999;
    return Math.min(dstSf, dstChorus) > 180;
  }).length ?? 0;
  const expansionOpps = repData?.accounts.filter(a => a.is_activated && a.bookings_90d < 30).length ?? 0;
  // Real open cases from Snowflake (case_data.open_cases), fallback to open_support_tickets
  const totalOpenTickets = repData?.accounts.reduce((s, a) => {
    const real = a.case_data?.open_cases;
    return s + (real !== undefined ? real : (a.open_support_tickets ?? 0));
  }, 0) ?? 0;
  const ticketAccounts = repData?.accounts.filter(a => {
    const real = a.case_data?.open_cases;
    return (real !== undefined ? real : (a.open_support_tickets ?? 0)) > 0;
  }).length ?? 0;
  // Average ARR across book
  const avgArr = repData && repData.accounts.length > 0
    ? Math.round(repData.accounts.reduce((s, a) => s + (a.total_arr ?? 0), 0) / repData.accounts.length)
    : 0;
  const recentBrief = repData?.accounts.find(a => a.chorus_calls && a.chorus_calls.length > 0);

  // Cx Ranker v2: score each account by urgency, surface top 5
  // Uses real support case data, TASK_ACTIVITY contact dates, and Flare signals
  type RankedAccount = Account & { _score: number; _reasons: string[]; _action: string };
  const rankedAccounts: RankedAccount[] = (repData?.accounts ?? []).map(a => {
    let score = 0;
    const reasons: string[] = [];
    // Health
    if (a.account_health === 'cancel_risk') { score += 40; reasons.push('cancel risk'); }
    else if (a.account_health === 'at_risk') { score += 20; reasons.push('at risk'); }
    // Cold contact: use best available signal (TASK_ACTIVITY primary, Chorus fallback)
    const dstSf = a.days_since_rep_contact ?? 9999;
    const dstChorus = a.days_since_touchpoint ?? 9999;
    const dst = Math.min(dstSf, dstChorus);
    if (dst >= 999) { score += 25; reasons.push('no contact on record'); }
    else if (dst > 180) { score += 20; reasons.push(`${dst}d no contact`); }
    else if (dst > 90) { score += 10; reasons.push(`${dst}d no contact`); }
    // Real support cases
    const cd = a.case_data;
    if (cd) {
      if (cd.escalated_cases > 0) { score += 30; reasons.push(`${cd.escalated_cases} escalated case${cd.escalated_cases > 1 ? 's' : ''}`); }
      else if (cd.open_cases > 0) { score += Math.min(cd.open_cases * 12, 24); reasons.push(`${cd.open_cases} open case${cd.open_cases > 1 ? 's' : ''}`); }
    }
    // Flare signals
    const flare = a.flare_signals ?? [];
    if (flare.includes('trajectory_decline')) { score += 20; reasons.push('booking decline'); }
    if (flare.includes('care_case')) { score += 15; reasons.push('care + no contact'); }
    if (flare.includes('activation_gap')) { score += 15; reasons.push('activation gap'); }
    // ARR weighting
    const arr = a.total_arr ?? 0;
    if (arr > 10000) score += 10;
    else if (arr > 5000) score += 5;
    // Account grade
    const grade = (a.account_grade ?? '').toUpperCase();
    if (grade === 'A' || grade === 'B') score += 10;
    // Underperforming live
    if (a.is_activated && a.bookings_90d < 20) { score += 8; reasons.push('low bookings'); }

    // Derive one specific action based on highest-priority signal
    let action = '';
    const atRiskProducts = (a.products ?? []).filter(p => ['live_at_risk', 'live_stalled', 'purchased_not_activated'].includes(p.status));
    if (cd && cd.escalated_cases > 0) {
      action = `Escalated case open - call before it becomes a cancel decision`;
    } else if (a.account_health === 'cancel_risk' && dst > 90) {
      action = `No contact in ${dst >= 999 ? '180+' : dst}d - reach out this week, cancel window is open`;
    } else if (a.account_health === 'cancel_risk') {
      action = `Cancel risk - review last call notes and identify the one thing holding them`;
    } else if (flare.includes('trajectory_decline')) {
      action = `Booking decline - ask: "Your volume dropped ${Math.round((1 - (a.bookings_90d / Math.max(a.bookings_90d * 1.3, 1))) * 100)}% - is that intentional or a config issue?"`;
    } else if (cd && cd.open_cases > 0) {
      action = `${cd.open_cases} open ticket${cd.open_cases > 1 ? 's' : ''} - check status before they escalate`;
    } else if (flare.includes('activation_gap')) {
      action = `Not yet activated - confirm schedule is live and floor plan is complete`;
    } else if (atRiskProducts.length > 0) {
      const prod = atRiskProducts[0].product;
      action = `${prod} stalled - ask: "What would it take to get value from ${prod} this quarter?"`;
    } else if (dst > 180) {
      action = `No recorded call in ${dst >= 999 ? '180+' : dst}d - schedule a check-in`;
    } else if (a.is_activated && a.bookings_90d < 20) {
      action = `Low bookings (${a.bookings_90d} in 90d) - confirm booking page is public and RwG is live`;
    }

    return { ...a, _score: score, _reasons: reasons.slice(0, 2), _action: action };
  }).sort((a, b) => b._score - a._score).slice(0, 5);

  const labelStyle: React.CSSProperties = {
    fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em',
    fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600, marginBottom: 8,
  };
  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 14px',
  };

  return (
    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ paddingBottom: 4 }}>
        <p style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{daily.dayName}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {repData?.slack_photo && (
            <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--accent-glow)', flexShrink: 0 }}>
              <img src={repData.slack_photo} alt={firstName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {daily.greeting}, {firstName}
            </p>
            {(repData?.title || repData?.region) && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {[repData.title, repData.region].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {streak >= 2 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,76,0,0.08)', border: '1px solid rgba(255,76,0,0.2)', borderRadius: 8, padding: '4px 10px' }}>
              <span style={{ fontSize: 14 }}>🔥</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>{streak} day streak</span>
            </div>
          )}
        </div>
      </div>

      {/* Today's signals */}
      {repData && (
        <div>
          <p style={labelStyle}>Today's signals</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {coldAccounts > 0 && (
              <button onClick={() => onNav('accounts')} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', borderLeft: '3px solid #f59e0b', borderColor: 'rgba(245,158,11,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{'🕐'}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{coldAccounts} accounts with no recorded call in 180+ days</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>No Chorus call on record. Schedule a check-in before issues surface.</p>
                  </div>
                </div>
              </button>
            )}
            {expansionOpps > 0 && (
              <button onClick={() => onNav('accounts')} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', borderLeft: '3px solid #10b981', borderColor: 'rgba(16,185,129,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{'📈'}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{expansionOpps} accounts below booking baseline</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Live but underperforming. Potential for product expansion or coaching.</p>
                  </div>
                </div>
              </button>
            )}
            {totalOpenTickets > 0 ? (
              <button onClick={() => onNav('accounts')} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', borderLeft: '3px solid #a78bfa', borderColor: 'rgba(167,139,250,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{'🎫'}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ticketAccounts} account{ticketAccounts !== 1 ? 's' : ''} with open support tickets ({totalOpenTickets} total)</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Review before these escalate into cancel risk.</p>
                  </div>
                </div>
              </button>
            ) : (
              <button onClick={() => onNav('ask')} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', borderLeft: '3px solid #a78bfa', borderColor: 'rgba(167,139,250,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{'🎫'}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>No open support tickets</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Ask the AI about any account's health or expansion angle.</p>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cx Ranker */}
      {repData && rankedAccounts.length > 0 && (
        <div>
          <p style={labelStyle}>Work this week</p>
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {rankedAccounts.map((acct, idx) => {
              const acctIdx = repData?.accounts.findIndex(a => a.name === acct.name) ?? -1;
              return (
              <button key={acct.name} onClick={() => { if (acctIdx >= 0) onPrepAccount(acctIdx); }} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                borderBottom: idx < rankedAccounts.length - 1 ? '1px solid var(--border)' : 'none',
                background: 'none', border: 'none', borderRadius: 0, cursor: 'pointer', textAlign: 'left', width: '100%',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-tertiary)', width: 14, flexShrink: 0 }}>{idx + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acct.name}</p>
                  {acct._action && (
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>{acct._action}</p>
                  )}
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {acct.city}, {acct.state}{acct.total_arr ? ` · $${(acct.total_arr / 1000).toFixed(1)}k ARR` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {acct._reasons.map(r => {
                    const isCancelRisk = r === 'cancel risk';
                    const isAtRisk = r === 'at risk';
                    const isEscalated = r.includes('escalated');
                    const isCase = r.includes('case') && !isEscalated;
                    const isFlare = r === 'booking decline' || r === 'care + no contact' || r === 'activation gap';
                    const color = isCancelRisk ? '#dc2626' : isAtRisk ? '#d97706' : isEscalated ? '#dc2626' : isCase ? '#a78bfa' : isFlare ? '#f59e0b' : '#64748b';
                    const bg = isCancelRisk ? 'rgba(220,38,38,0.08)' : isAtRisk ? 'rgba(245,158,11,0.08)' : isEscalated ? 'rgba(220,38,38,0.08)' : isCase ? 'rgba(167,139,250,0.08)' : isFlare ? 'rgba(245,158,11,0.08)' : 'rgba(100,116,139,0.08)';
                    const border = isCancelRisk ? 'rgba(220,38,38,0.2)' : isAtRisk ? 'rgba(245,158,11,0.2)' : isEscalated ? 'rgba(220,38,38,0.2)' : isCase ? 'rgba(167,139,250,0.2)' : isFlare ? 'rgba(245,158,11,0.2)' : 'rgba(100,116,139,0.2)';
                    return (
                      <span key={r} style={{ fontSize: 9, fontWeight: 600, fontFamily: 'monospace', color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: '2px 5px', whiteSpace: 'nowrap' }}>
                        {r.toUpperCase()}
                      </span>
                    );
                  })}
                </div>
              </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Book at a glance */}
      {repData && (
        <div>
          <p style={labelStyle}>Book at a glance</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <button onClick={() => onNav('accounts')} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{total}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>accounts</p>
            </button>
            <button onClick={() => onNav('accounts')} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#10b981', letterSpacing: '-0.02em' }}>{activated}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>live and active</p>
            </button>
            <button onClick={() => onNav('accounts')} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', borderColor: coldAccounts > 0 ? 'rgba(245,158,11,0.3)' : 'var(--border)' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: coldAccounts > 0 ? '#f59e0b' : 'var(--text-primary)', letterSpacing: '-0.02em' }}>{coldAccounts}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>going cold</p>
            </button>
            {avgArr > 0 && (
              <button onClick={() => onNav('accounts')} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>${(avgArr / 1000).toFixed(1)}k</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>avg ARR / acct</p>
              </button>
            )}
            {totalOpenTickets > 0 && (
              <button onClick={() => onNav('accounts')} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', borderColor: 'rgba(167,139,250,0.3)' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#a78bfa', letterSpacing: '-0.02em' }}>{totalOpenTickets}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>open tickets</p>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Attach intel panel */}
      {repEmail && <AttachIntelPanel repEmail={repEmail} onShowGapAccounts={onShowGapAccounts} />}

      {/* Quick actions */}
      <div>
        <p style={labelStyle}>Jump to</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Prep brief', sub: recentBrief ? `Last: ${recentBrief.name}` : 'Generate before your call', mode: 'prep' as Mode, accent: true },
            { label: 'Ask anything', sub: 'Account context, signals, strategy', mode: 'ask' as Mode, accent: false },
            { label: 'Accounts', sub: 'Health, cancel window, expansion', mode: 'accounts' as Mode, accent: false },
            { label: 'Workflows', sub: 'Kick off work for a customer', mode: 'workflows' as Mode, accent: false },
          ].map(item => (
            <button key={item.mode} onClick={() => onNav(item.mode)} style={{
              ...cardStyle, cursor: 'pointer', textAlign: 'left',
              borderColor: item.accent ? 'rgba(255,76,0,0.3)' : 'var(--border)',
              borderLeft: item.accent ? '3px solid var(--accent)' : '1px solid var(--border)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{item.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{item.sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Action items - onboarding staged checklist or regular list */}
      {isOnboarding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ONBOARDING_WEEKS.map((week, wi) => {
            const weekDone = week.items.every(it => obDone[it.id]);
            const weekStart = wi * 7;
            const isActive = daysIn >= weekStart;
            return (
              <div key={week.label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <p style={{ ...labelStyle, margin: 0, opacity: isActive ? 1 : 0.4 }}>{week.label}</p>
                  {weekDone && <span style={{ fontSize: 10, color: '#10b981', fontFamily: 'monospace', fontWeight: 600 }}>DONE</span>}
                </div>
                <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 0, opacity: isActive ? 1 : 0.5 }}>
                  {week.items.map((item, idx) => (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                      borderBottom: idx < week.items.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <input type="checkbox" checked={!!obDone[item.id]} onChange={() => isActive && toggleOb(item.id)}
                        disabled={!isActive}
                        style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0, cursor: isActive ? 'pointer' : 'default' }} />
                      <p style={{ flex: 1, fontSize: 12, color: obDone[item.id] ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: obDone[item.id] ? 'line-through' : 'none', lineHeight: 1.4 }}>{item.text}</p>
                      {item.mode && !obDone[item.id] && isActive && (
                        <button onClick={() => onNav(item.mode!)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer', fontSize: 10, fontWeight: 600, padding: '2px 7px', flexShrink: 0 }}>Go</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <p style={labelStyle}>For you</p>
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[...actions].sort((a, b) => Number(a.done) - Number(b.done)).map((item, idx) => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                borderBottom: idx < actions.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <input type="checkbox" checked={item.done} onChange={() => toggleAction(item.id)}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }} />
                <p style={{ flex: 1, fontSize: 12, color: item.done ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: item.done ? 'line-through' : 'none', lineHeight: 1.4 }}>{item.text}</p>
                <button onClick={() => deleteAction(item.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>x</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: actions.length > 0 ? 8 : 0 }}>
              <input
                value={newAction} onChange={e => setNewAction(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAction()}
                placeholder="Add item..."
                style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12, padding: '4px 0', outline: 'none' }}
              />
              {newAction && (
                <button onClick={addAction} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 }}>Add</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Daily quote */}
      <div style={{ padding: '10px 14px', background: 'var(--bg-strip)', borderRadius: 10, borderLeft: '2px solid var(--accent)' }}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5, marginBottom: 3 }}>"{daily.quote.quote}"</p>
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{daily.spark}</p>
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

function PrepBriefView({ brief, selected, repData, onRefresh, confColor, confBg, statusIcon }: {
  brief: PrepBrief; selected: Account; repData: RepData; onRefresh: () => void;
  confColor: Record<string, string>; confBg: Record<string, string>;
  statusIcon: Record<string, { icon: string; color: string }>;
}) {
  return (
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
          <button onClick={onRefresh}
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
  );
}
function PrepTab({ repData, repDataLoaded, selectedAccountIdx, setSelectedAccountIdx, onBriefGenerated }: {
  repData: RepData | null; repDataLoaded: boolean; selectedAccountIdx: number | null; setSelectedAccountIdx: (i: number | null) => void; onBriefGenerated?: () => void;
}) {
  const [brief, setBrief] = useState<PrepBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastIdx, setLastIdx] = useState<number | null>(null);
  const selected = selectedAccountIdx !== null ? (repData?.accounts[selectedAccountIdx] ?? null) : null;

  // Auto-generate when arriving from Home with a pre-selected account
  useEffect(() => {
    if (selectedAccountIdx !== null && selectedAccountIdx !== lastIdx && repData && !loading) {
      generate(selectedAccountIdx);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountIdx, repData]);

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
            products: acct.products,
            days_since_touchpoint: acct.days_since_touchpoint,
            open_support_tickets: acct.open_support_tickets,
            total_arr: acct.total_arr,
            account_health: acct.account_health,
            locations: acct.locations,
            chorus_calls: (acct.chorus_calls ?? []).map(c => ({ call_date: c.call_date, summary: c.summary, action_items: c.action_items })),
          },
        }),
      });
      const data = await res.json() as { brief?: PrepBrief; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.brief) { setBrief(data.brief); onBriefGenerated?.(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  };

  const confColor = { high: '#059669', medium: '#d97706', low: '#dc2626' };
  const confBg = { high: 'rgba(16,185,129,0.08)', medium: 'rgba(245,158,11,0.08)', low: 'rgba(220,38,38,0.08)' };
  const statusIcon = { pending: { icon: '○', color: '#d97706' }, likely_done: { icon: '✓', color: '#059669' }, unknown: { icon: '?', color: 'var(--text-tertiary)' } };

  if (!repDataLoaded) return <div style={{ paddingTop: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading account data...</div>;
  if (!repData) return (
    <div style={{ paddingTop: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No accounts seeded yet</p>
      <p style={{ fontSize: 12 }}>Ask your manager to add your pipeline, or use Ask mode to prep for a call manually.</p>
    </div>
  );

  if (selectedAccountIdx !== null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { setSelectedAccountIdx(null); setBrief(null); setError(null); setLastIdx(null); }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, padding: '4px 10px' }}>
            Back to accounts
          </button>
          {selected && <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{selected.name} · {selected.city}, {selected.state}</p>}
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {repData.accounts.map((acct, i) => (
            <button key={acct.name + i} onClick={() => { setSelectedAccountIdx(i); if (lastIdx !== i) generate(i); }}
              style={{
                flexShrink: 0, fontSize: 11, padding: '4px 10px', borderRadius: 8,
                background: selectedAccountIdx === i ? 'var(--accent-light)' : 'var(--bg-card)',
                border: `1px solid ${selectedAccountIdx === i ? 'var(--accent-glow)' : 'var(--border)'}`,
                color: selectedAccountIdx === i ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              {acct.name}
            </button>
          ))}
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

        {brief && selected && !loading && <PrepBriefView brief={brief} selected={selected} repData={repData} onRefresh={() => generate(selectedAccountIdx!)} confColor={confColor} confBg={confBg} statusIcon={statusIcon} />}
      </div>
    );
  }

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

      {!selected && !loading && !brief && (
        <div style={{ paddingTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>Click an account above to generate a brief.</div>
      )}
    </div>
  );
}

// ── Chorus calls accordion ─────────────────────────────────────────────────
function ChorusCallsAccordion({ calls }: { calls: ChorusCall[] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>Last Chorus Calls</p>
      {calls.map((call, idx) => {
        const items = (() => { try { return JSON.parse(call.action_items) as string[]; } catch { return call.action_items ? [call.action_items] : []; } })();
        const summary = call.summary.replace(/<br>/gi, ' ').replace(/Action Items:[\s\S]*?Meeting Summary:/, 'Meeting Summary:').trim();
        const isOpen = !!expanded[idx];
        return (
          <div key={idx} style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, overflow: 'hidden' }}>
            <button
              onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}
            >
              <p style={{ fontSize: 11, color: '#3b82f6', fontWeight: 500, margin: 0 }}>{call.call_date}</p>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', transition: 'transform 0.2s', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </button>
            {!isOpen && summary && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, padding: '0 12px 10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{summary}</p>
            )}
            {isOpen && (
              <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {summary && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{summary}</p>}
                {items.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 4 }}>Action items:</p>
                    <ul style={{ paddingLeft: 14, margin: 0 }}>
                      {items.map((item, i) => <li key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Accounts tab ───────────────────────────────────────────────────────────
function AccountsTab({ data, productFilter, onClearFilter }: { data: RepData; productFilter?: string | null; onClearFilter?: () => void }) {
  const filteredAccounts = productFilter
    ? data.accounts.filter(a => {
        const match = a.products?.find(p => p.product === productFilter);
        return !match || match.status !== 'live_healthy';
      })
    : data.accounts;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{data.rep_name}</p>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{data.team} · {data.region} · Updated {new Date(data.seeded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
            {productFilter ? `Accounts without ${productFilter}` : 'Your Accounts'}
            {productFilter && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> ({filteredAccounts.length})</span>}
          </p>
          {productFilter && onClearFilter && (
            <button onClick={onClearFilter} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, padding: '2px 8px' }}>
              Clear filter
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredAccounts.map(acct => {
            const days = acct.is_activated ? null : daysSince(acct.signed_date);
            const action = (() => {
              if (acct.is_activated || days === null) return null;
              if (days < 7) return { text: 'Schedule setup call', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' };
              if (days < 14) return { text: 'Setup call overdue - check in', color: '#d97706', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' };
              return { text: 'At risk - follow up now', color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)' };
            })();

            return (
              <div key={acct.name} className="card" style={{ gap: 12, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13 }}>{acct.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{acct.city}, {acct.state} · Signed {acct.signed_date}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {acct.current_booking_platform && acct.current_booking_platform !== 'None' && (
                        <span style={{ background: 'rgba(139,92,246,0.08)', color: '#7c3aed', border: '1px solid rgba(139,92,246,0.2)', fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 8 }}>
                          on {acct.current_booking_platform}
                        </span>
                      )}
                      {acct.total_arr != null && acct.total_arr > 0 && (
                        <span style={{ background: 'var(--bg-strip)', color: 'var(--text-tertiary)', border: '1px solid var(--border)', fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 8 }}>
                          ${acct.total_arr.toLocaleString()} ARR
                        </span>
                      )}
                      {acct.open_support_tickets != null && acct.open_support_tickets > 0 && (
                        <span style={{ background: 'rgba(167,139,250,0.08)', color: '#7c3aed', border: '1px solid rgba(167,139,250,0.2)', fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 8 }}>
                          {acct.open_support_tickets} open ticket{acct.open_support_tickets !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {acct.is_activated && acct.account_health ? (
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 10,
                        background: acct.account_health === 'healthy' ? 'rgba(16,185,129,0.08)' : acct.account_health === 'at_risk' ? 'rgba(245,158,11,0.08)' : 'rgba(220,38,38,0.08)',
                        color: acct.account_health === 'healthy' ? '#059669' : acct.account_health === 'at_risk' ? '#d97706' : '#dc2626',
                        border: `1px solid ${acct.account_health === 'healthy' ? 'rgba(16,185,129,0.2)' : acct.account_health === 'at_risk' ? 'rgba(245,158,11,0.2)' : 'rgba(220,38,38,0.2)'}`,
                      }}>
                        {acct.account_health === 'healthy' ? 'Healthy' : acct.account_health === 'at_risk' ? 'At risk' : 'Cancel risk'}
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 10,
                        background: acct.is_activated ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                        color: acct.is_activated ? '#059669' : '#d97706',
                        border: `1px solid ${acct.is_activated ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                      }}>
                        {acct.is_activated ? 'Activated' : acct.activation_status}
                      </span>
                    )}
                    {days !== null && (() => {
                      const target = new Date(acct.signed_date);
                      target.setDate(target.getDate() + 30);
                      const targetStr = target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      return <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>activate by {targetStr} · day {days}</span>;
                    })()}
                    {acct.days_since_touchpoint != null && acct.is_activated && (
                      <span style={{ fontSize: 10, color: acct.days_since_touchpoint > 180 ? '#f59e0b' : 'var(--text-tertiary)' }}>
                        last call: {acct.days_since_touchpoint >= 999 ? 'none on record' : `${acct.days_since_touchpoint}d ago`}
                      </span>
                    )}
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
                    { label: 'last booking', value: acct.last_booking_date ?? '-' },
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

                {acct.products && acct.products.length > 0 && (() => {
                  const purchased = acct.products!.filter(p => p.status !== 'not_purchased');
                  const atRisk = purchased.filter(p => ['live_at_risk', 'live_stalled', 'purchased_not_activated'].includes(p.status));
                  const healthy = purchased.filter(p => p.status === 'live_healthy');
                  const notPurchased = acct.products!.filter(p => p.status === 'not_purchased');
                  const statusColors: Record<string, { color: string; bg: string }> = {
                    live_healthy: { color: '#059669', bg: 'rgba(16,185,129,0.08)' },
                    live_stalled: { color: '#d97706', bg: 'rgba(245,158,11,0.08)' },
                    live_at_risk: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
                    purchased_not_activated: { color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
                    not_purchased: { color: 'var(--color-text-muted)', bg: 'transparent' },
                  };
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                        Product Portfolio
                        {atRisk.length > 0 && <span style={{ marginLeft: 8, color: '#dc2626', fontWeight: 700 }}>{atRisk.length} at risk</span>}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {purchased.map(p => {
                          const sc = statusColors[p.status] ?? statusColors.live_healthy;
                          return (
                            <span key={p.product} title={p.notes ?? ''} style={{
                              fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 6,
                              background: sc.bg, color: sc.color,
                              border: `1px solid ${sc.color}30`,
                              cursor: p.notes ? 'help' : 'default',
                            }}>
                              {p.product}
                            </span>
                          );
                        })}
                        {notPurchased.length > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', padding: '3px 0', alignSelf: 'center' }}>
                            +{notPurchased.length} not yet
                          </span>
                        )}
                      </div>
                      {atRisk.length > 0 && (
                        <div style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)', color: '#dc2626' }}>
                          Needs attention: {atRisk.map(p => `${p.product}${p.notes ? ` (${p.notes})` : ''}`).join(', ')}
                        </div>
                      )}
                      {healthy.length > 0 && notPurchased.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', padding: '4px 0' }}>
                          Expansion: {notPurchased.slice(0, 3).map(p => p.product).join(', ')}{notPurchased.length > 3 ? ` +${notPurchased.length - 3} more` : ''}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {(acct.chorus_calls?.length ?? 0) > 0 && (
                  <ChorusCallsAccordion calls={acct.chorus_calls!} />
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
    'Review this account and give me the opening angle',
    'Draft a follow-up email for my last call',
    'Which accounts in my book are at risk right now?',
    'What upsell should I pitch to a healthy 90-day account?',
    'How do I handle a customer who is not activating?',
    'What features should I make sure my customer is using?',
  ],
  train: [
    'Walk me through activation best practices for a new account',
    'What are the signals that an account is at churn risk?',
    'How do I pitch Named Experiences to an existing customer?',
    'Help me prepare for a QBR with a multi-location customer',
    'What is the right cadence for AM touchpoints?',
    'How do I escalate a product issue on behalf of a customer?',
  ],
};

// ── Language support ────────────────────────────────────────────────────────
const LANGUAGES: { code: string; label: string; flag: string }[] = [
  { code: 'en',    label: 'English',    flag: '🇺🇸' },
  { code: 'es',    label: 'Español',    flag: '🇪🇸' },
  { code: 'pt-BR', label: 'Português',  flag: '🇧🇷' },
  { code: 'fr',    label: 'Français',   flag: '🇫🇷' },
  { code: 'de',    label: 'Deutsch',    flag: '🇩🇪' },
  { code: 'it',    label: 'Italiano',   flag: '🇮🇹' },
  { code: 'pl',    label: 'Polski',     flag: '🇵🇱' },
  { code: 'nl',    label: 'Nederlands', flag: '🇳🇱' },
  { code: 'ru',    label: 'Русский',    flag: '🇷🇺' },
  { code: 'ar',    label: 'العربية',    flag: '🇸🇦' },
  { code: 'hi',    label: 'हिंदी',     flag: '🇮🇳' },
  { code: 'zh',    label: '中文',       flag: '🇨🇳' },
  { code: 'ja',    label: '日本語',     flag: '🇯🇵' },
  { code: 'ko',    label: '한국어',     flag: '🇰🇷' },
  { code: 'vi',    label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'tl',    label: 'Filipino',   flag: '🇵🇭' },
];

function speakText(text: string, lang: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/<[^>]+>/g, '').replace(/#+\s/g, '').replace(/\*+/g, '').trim();
  const utt = new SpeechSynthesisUtterance(clean);
  utt.lang = lang;
  utt.rate = 1.05;
  const assign = () => {
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(v => v.lang === lang) ?? voices.find(v => v.lang.startsWith(lang.split('-')[0]));
    if (match) utt.voice = match;
    window.speechSynthesis.speak(utt);
  };
  // getVoices() is async in Chrome - wait for population if empty
  if (window.speechSynthesis.getVoices().length > 0) { assign(); }
  else { window.speechSynthesis.addEventListener('voiceschanged', assign, { once: true }); }
}

function ChatPane({ mode, repData, selectedAccountIdx, setSelectedAccountIdx }: {
  mode: 'ask' | 'train'; repData: RepData | null;
  selectedAccountIdx: number | null; setSelectedAccountIdx: (i: number | null) => void;
}) {
  const { messages, sendMessage, status: chatStatus } = useChat({ id: mode });
  const [input, setInput] = useState('');
  const [recentQuestions, setRecentQuestions] = useState<string[]>([]);
  const [lastActive, setLastActive] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>('en');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const speakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoading = chatStatus === 'streaming' || chatStatus === 'submitted';
  const bottomRef = useRef<HTMLDivElement>(null);

  // Language is session-only - do not persist, always start English

  // Clean up speech + polling on unmount
  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    if (speakIntervalRef.current) clearInterval(speakIntervalRef.current);
  }, []);
  const selected = selectedAccountIdx !== null ? (repData?.accounts[selectedAccountIdx] ?? null) : null;

  const contextRef = useRef<{ repContext?: RepContext; accountContext?: AccountContext; language?: string; runtime?: Record<string, string> }>({});
  contextRef.current = {
    repContext: repData ? { rep_name: repData.rep_name, team: repData.team, region: repData.region } : undefined,
    accountContext: selected ? buildAccountPayload(selected) : undefined,
    language,
    runtime: Object.keys(runtime).length > 0 ? runtime : undefined,
  };

  const currentLang = LANGUAGES.find(l => l.code === language) ?? LANGUAGES[0];

  const langPickerRef = useRef<HTMLDivElement>(null);
  const setLang = (code: string) => {
    setLanguage(code);
    setShowLangPicker(false);
  };

  useEffect(() => {
    if (!showLangPicker) return;
    const handler = (e: MouseEvent) => {
      if (langPickerRef.current && !langPickerRef.current.contains(e.target as Node)) {
        setShowLangPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLangPicker]);

  // Load history when repData arrives (it comes in async after mount)
  useEffect(() => {
    const repKey = repData?.rep_name ?? null;
    if (!repKey) return;
    const saved = loadChatHistory(repKey, mode);
    if (saved) {
      setLastActive(saved.savedAt);
      const questions = saved.messages
        .filter(m => m.role === 'user')
        .slice(-3)
        .map(m => m.text)
        .reverse();
      setRecentQuestions(questions);
    }
  }, [repData?.rep_name, mode]);

  // Save history whenever messages change
  useEffect(() => {
    const repKey = repData?.rep_name ?? null;
    if (!repKey || messages.length === 0) return;
    const flat = messages.map(msg => ({
      role: msg.role,
      text: msg.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(''),
    }));
    saveChatHistory(repKey, mode, flat);
  }, [messages, repData, mode]);

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
              {repData.accounts.map((a, i) => <option key={i} value={i}>{a.name} - {a.activation_status}</option>)}
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
      <div style={{ flex: messages.length === 0 ? '0 0 auto' : 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
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
                      {lastActive && (
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace', marginTop: 4 }}>
                          Last session: {formatRelativeDate(lastActive)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {recentQuestions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace', padding: '0 2px' }}>
                    Pick up where you left off
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {recentQuestions.map(q => (
                      <button key={q} onClick={() => submit(q)} className="chip" style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 10, fontSize: 12, borderLeft: '2px solid var(--accent)' }}>
                        {q.length > 80 ? q.slice(0, 77) + '...' : q}
                      </button>
                    ))}
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

                {msg.role === 'assistant' && (
                  <div style={{ marginTop: 4, marginLeft: 36, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      title={speakingId === msg.id ? 'Stop' : 'Read aloud'}
                      onClick={() => {
                        if (speakingId === msg.id) {
                          window.speechSynthesis?.cancel();
                          setSpeakingId(null);
                        } else {
                          setSpeakingId(msg.id);
                          speakText(display, language);
                          if (speakIntervalRef.current) clearInterval(speakIntervalRef.current);
                          speakIntervalRef.current = setInterval(() => {
                            if (!window.speechSynthesis?.speaking) {
                              setSpeakingId(null);
                              clearInterval(speakIntervalRef.current!);
                              speakIntervalRef.current = null;
                            }
                          }, 300);
                        }
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: speakingId === msg.id ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: 13, padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}
                    >
                      {speakingId === msg.id ? '■' : '▶'}
                    </button>
                    {isLastAI && suggestions.length > 0 && suggestions.map((s, i) => (
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
        <form onSubmit={e => { e.preventDefault(); submit(input); }} style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 8, position: 'relative' }}>
          {/* Language picker */}
          <div ref={langPickerRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button type="button" onClick={() => setShowLangPicker(p => !p)}
              title="Switch language"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 10px', height: 42, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
              <span>{currentLang.flag}</span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>{currentLang.code.toUpperCase().slice(0, 2)}</span>
            </button>
            {showLangPicker && (
              <div style={{
                position: 'absolute', bottom: '110%', left: 0, zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)', minWidth: 220,
              }}>
                {LANGUAGES.map(l => (
                  <button key={l.code} type="button" onClick={() => setLang(l.code)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
                      background: l.code === language ? 'var(--accent-light)' : 'none',
                      border: l.code === language ? '1px solid var(--accent-glow)' : '1px solid transparent',
                      borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    }}>
                    <span style={{ fontSize: 15 }}>{l.flag}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: l.code === language ? 600 : 400 }}>{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
        {/* language indicator intentionally omitted - Live mode handles its own */}
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
          <span>2. DEMAND GEN - DAY ONE</span>
          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600, textTransform: 'none', letterSpacing: 0, background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 10 }}>OBSERVED</span>
        </div>
        <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(255,76,0,0.05)', borderRadius: 6, border: '1px solid rgba(255,76,0,0.15)', fontSize: 11, color: 'var(--text-secondary)' }}>
          Only ~{Math.round(OT_NETWORK_PCT * 100)}% of OT bookings come from OT's own app. The rest is organic, Google, and direct - Toast Tables replaces that on day one.
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
          <span>3. DEMAND GEN - INVEST</span>
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
              {showInternal && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Industry benchmark (Klaviyo/SevenRooms) - no internal Snowflake data</div>}
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
              {showInternal && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No internal ROAS data - directional only</div>}
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

// ── Workflows tab ──────────────────────────────────────────────────────────
function WorkflowsTab({ repData }: { repData: RepData | null }) {
  const [toastIQOpen, setToastIQOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const accounts = repData?.accounts ?? [];
  const acctName = selectedAccount || '[account name]';

  const toastIQMessage = `Hi! I wanted to follow up on our last conversation. Toast IQ is now available for your account and it only takes about 10 minutes to get set up. It can help you [automate guest responses, optimize your reservation flow, and surface insights from your bookings]. You can get started here: toast.app/iq -- let me know if you have any questions and I am happy to walk through it with you.`;

  const copyMessage = () => {
    navigator.clipboard.writeText(toastIQMessage.replace('[account name]', acctName)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const cardBase: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
  };

  const workflows = [
    { emoji: '📅', title: 'Scheduling agent', desc: 'Build a shift schedule or floor plan based on booking patterns and cover targets.', status: 'Next wave' },
    { emoji: '📣', title: 'Marketing plan', desc: 'Draft a seasonal promo or email campaign based on slow periods and guest data.', status: 'Next wave' },
    { emoji: '📊', title: 'Business review', desc: 'Auto-generate a QBR deck: covers, bookings, competitive benchmark, upsell opportunity.', status: 'Next wave' },
  ];

  return (
    <div style={{ padding: '24px 16px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 600, marginBottom: 6 }}>Workflows</p>
        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Do work for your customers</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Kick off AI-assisted tasks on behalf of a specific account. You stay in the loop at every decision point.</p>
      </div>

      {/* Toast IQ handoff - live */}
      <div style={{ ...cardBase, borderColor: 'rgba(255,76,0,0.3)', background: 'rgba(255,76,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{'✨'}</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Toast IQ handoff</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Restaurant-facing AI setup, available today</p>
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(255,76,0,0.12)', border: '1px solid rgba(255,76,0,0.2)', borderRadius: 20, padding: '2px 8px', fontFamily: 'monospace', textTransform: 'uppercase' as const }}>Live</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          When a customer is ready to self-serve, send them a message pointing them to Toast IQ. Takes 30 seconds. You get credit for the activation.
        </p>
        <button
          onClick={() => setToastIQOpen(true)}
          style={{ padding: '9px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, alignSelf: 'flex-start' as const }}
        >
          Send to customer
        </button>
      </div>

      {/* Upcoming workflow cards */}
      {workflows.map(w => (
        <div key={w.title} style={{ ...cardBase, opacity: 0.7 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{w.emoji}</span>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{w.title}</p>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', background: 'var(--bg-strip)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px', fontFamily: 'monospace', textTransform: 'uppercase' as const }}>{w.status}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{w.desc}</p>
        </div>
      ))}

      {/* Toast IQ modal */}
      {toastIQOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 24, maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Send Toast IQ message</p>
              <button onClick={() => setToastIQOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>x</button>
            </div>
            {accounts.length > 0 && (
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Select account (optional)</p>
                <select
                  value={selectedAccount}
                  onChange={e => setSelectedAccount(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}
                >
                  <option value="">No account selected</option>
                  {accounts.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Message to copy</p>
              <div style={{ background: 'var(--bg-strip)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{toastIQMessage}</p>
              </div>
            </div>
            <button
              onClick={copyMessage}
              style={{ padding: '10px 16px', background: copied ? '#10b981' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background 0.2s' }}
            >
              {copied ? 'Copied!' : 'Copy message'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab icons ──────────────────────────────────────────────────────────────
function HomeIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function AskIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PrepIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function AccountsIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function WorkflowsIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('home');
  const [repData, setRepData] = useState<RepData | null>(null);
  const [repDataLoaded, setRepDataLoaded] = useState(false);
  const [selectedAccountIdx, setSelectedAccountIdx] = useState<number | null>(null);
  const [isDark, setIsDark] = useState(true);
  const [confetti, setConfetti] = useState(false);
  const [accountsProductFilter, setAccountsProductFilter] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const streak = useStreak();
  const [repEmail, setRepEmail] = useState<string | null>(null);
  const [collectorDone, setCollectorDone] = useState(false);
  const [collectorAnswers, setCollectorAnswers] = useState<Record<string, string>>({ focus: '', account: '' });
  const [runtime, setRuntime] = useState<Record<string, string>>({});

  // Load session email from API
  useEffect(() => {
    fetch('/api/me').then(r => {
      if (!r.ok) { router.push('/login'); return null; }
      return r.json();
    }).then(d => { if (d?.email) setRepEmail(d.email); }).catch(() => router.push('/login'));
  }, [router]);

  // Check collector once email is known
  useEffect(() => {
    if (!repEmail) return;
    if (isCollectorComplete('am')) {
      const saved = loadCollectorAnswers('am') ?? {};
      setRuntime(saved);
      setCollectorDone(true);
    }
  }, [repEmail]);

  // Load persisted preferences + onboarding check
  useEffect(() => {
    const dark = localStorage.getItem('rep_dark');
    if (dark !== null) setIsDark(dark === '1');
    if (!localStorage.getItem('rep_onboarding_done')) setShowOnboarding(true);
    // Remove stale language key - language is now session-only, never persisted
    try { localStorage.removeItem('rep_language'); } catch {}
  }, []);

  // Apply dark/light to html element
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    if (!repEmail) return;
    fetch(`/api/accounts?email=${encodeURIComponent(repEmail)}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setRepData(d as RepData); setRepDataLoaded(true); })
      .catch(() => { setRepDataLoaded(true); });
  }, [repEmail]);

  const toggleDark = useCallback(() => {
    setIsDark(d => { localStorage.setItem('rep_dark', d ? '0' : '1'); return !d; });
  }, []);

  const firstName = repData?.rep_name.split(' ')[0];

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem('rep_onboarding_done', '1');
    setShowOnboarding(false);
  }, []);

  const submitCollector = () => {
    const rt: Record<string, string> = {};
    if (collectorAnswers.focus?.trim()) rt.focus = collectorAnswers.focus.trim();
    if (collectorAnswers.account?.trim()) rt.account = collectorAnswers.account.trim();
    saveCollectorAnswers('am', rt);
    setRuntime(rt);
    setCollectorDone(true);
  };

  // Show spinner while email not yet loaded
  if (!repEmail) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #FF4C00', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  // Collector modal: shown once per session after login
  const greeting2 = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  if (!collectorDone) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page, #0a0a0a)', padding: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 340 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary, #f5f5f5)' }}>{greeting2}{firstName ? `, ${firstName}` : ''}.</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary, #666)', marginTop: 2 }}>Two quick questions to focus your session.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #999)' }}>What are you focused on today?</label>
          <input
            autoFocus
            value={collectorAnswers.focus}
            onChange={e => setCollectorAnswers(p => ({ ...p, focus: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') submitCollector(); }}
            placeholder="e.g. cancel risk review, xtraCHEF attach, QBR prep"
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #333)', background: 'var(--bg-card, #1a1a1a)', color: 'var(--text-primary, #f5f5f5)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #999)' }}>Any specific account on your mind?</label>
          <input
            value={collectorAnswers.account}
            onChange={e => setCollectorAnswers(p => ({ ...p, account: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') submitCollector(); }}
            placeholder="e.g. 13 Coins Vancouver, or leave blank"
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #333)', background: 'var(--bg-card, #1a1a1a)', color: 'var(--text-primary, #f5f5f5)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={submitCollector} style={{ flex: 1, padding: '9px 16px', borderRadius: 8, background: '#FF4C00', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Start session</button>
          <button onClick={() => { setCollectorDone(true); }} style={{ padding: '9px 14px', borderRadius: 8, background: 'transparent', color: 'var(--text-tertiary, #666)', border: '1px solid var(--border, #333)', fontSize: 12, cursor: 'pointer' }}>Skip</button>
        </div>
      </div>
    </div>
  );

  // Header right: dark toggle + avatar
  const headerRight = (
    <>
      {streak >= 2 && (
        <div title={`${streak}-day streak`} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,76,0,0.08)', border: '1px solid rgba(255,76,0,0.2)', borderRadius: 8, padding: '3px 8px' }}>
          <span style={{ fontSize: 13 }}>{'🔥'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>{streak}</span>
        </div>
      )}
      <button
        onClick={toggleDark}
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
      {(firstName || repEmail) && (
        <button
          title={`Signed in as ${repEmail ?? ''} - click to sign out`}
          onClick={async () => { await fetch('/api/logout', { method: 'POST' }); router.push('/login'); }}
          style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', border: '2px solid var(--border)', cursor: 'pointer', padding: 0 }}
        >
          {repData?.slack_photo
            ? <img src={repData.slack_photo} alt={firstName ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-text)' }}>{(firstName ?? repEmail ?? '?')[0].toUpperCase()}</span>
          }
        </button>
      )}
    </>
  );

  const tabs: (import('@/components/platform/MobileNav').NavTab & { content: React.ReactNode })[] = [
    {
      id: 'home',
      label: 'Home',
      icon: <HomeIcon />,
      content: <HomeTab repData={repData} repEmail={repEmail} streak={streak} onNav={m => setMode(m)} onPrepAccount={idx => { setSelectedAccountIdx(idx); setMode('prep'); }} onShowGapAccounts={productName => { setAccountsProductFilter(productName); setMode('accounts'); }} />,
    },
    {
      id: 'ask',
      label: 'Ask',
      icon: <AskIcon />,
      content: <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}><ChatPane mode="ask" repData={repData} selectedAccountIdx={selectedAccountIdx} setSelectedAccountIdx={setSelectedAccountIdx} /></div>,
    },
    {
      id: 'prep',
      label: 'Prep',
      icon: <PrepIcon />,
      content: (
        <div style={{ padding: '24px 16px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <PrepTab repData={repData} repDataLoaded={repDataLoaded} selectedAccountIdx={selectedAccountIdx} setSelectedAccountIdx={setSelectedAccountIdx} onBriefGenerated={() => setConfetti(true)} />
          </div>
        </div>
      ),
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: <AccountsIcon />,
      content: (
        <div style={{ padding: '24px 16px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            {repData ? <AccountsTab data={repData} productFilter={accountsProductFilter} onClearFilter={() => setAccountsProductFilter(null)} /> : (
              <div style={{ paddingTop: 48, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No data for <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-strip)', padding: '1px 6px', borderRadius: 4 }}>{repEmail}</code>.</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>Ask Dan to run <code style={{ fontFamily: 'monospace', fontSize: 10 }}>seed_rep_accounts.py</code></p>
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'workflows',
      label: 'Workflows',
      icon: <WorkflowsIcon />,
      content: <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}><WorkflowsTab repData={repData} /></div>,
    },
    {
      id: 'roi',
      label: 'ROI',
      icon: (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      content: <ROICalculator />,
    },
    {
      id: 'listen',
      label: 'Live',
      icon: (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      ),
      content: <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}><ListenTab repData={repData} /></div>,
    },
  ];

  return (
    <>
      <ConfettiBurst visible={confetti} onDone={() => setConfetti(false)} />
      {showOnboarding && <OnboardingBanner onDismiss={dismissOnboarding} onGo={m => { setMode(m); dismissOnboarding(); }} />}
      <TabShell
        persona="am"
        appName="Account Manager"
        appNameAccent="Manager"
        headerRight={headerRight}
        tabs={tabs}
        activeTab={mode}
        onTabChange={m => setMode(m as Mode)}
      />
    </>
  );
}
