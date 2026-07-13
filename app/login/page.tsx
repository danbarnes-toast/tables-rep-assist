'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const QUOTES = [
  { q: "Every call is an opportunity to change someone's business.", attr: 'field wisdom' },
  { q: "The best close is a genuine conversation.", attr: 'sales lore' },
  { q: "Preparation is the close that happens before the call.", attr: 'field wisdom' },
  { q: "Objections are just requests for more information.", attr: 'sales lore' },
  { q: "You don't close deals. You help people make decisions.", attr: 'field wisdom' },
  { q: "The rep who listens most wins most.", attr: 'field wisdom' },
  { q: "Every no gets you closer to a yes.", attr: 'sales lore' },
];
const SPARKS = ['Have a great one.', "Let's go.", 'Go get it.', 'Make it count.', 'Today could be the day.'];

function getDailyLoginContent(d: Date) {
  const hour = d.getHours();
  const seed = d.getFullYear() * 1000 + Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  return {
    day: DAYS[d.getDay()],
    greeting: hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening',
    quote: QUOTES[seed % QUOTES.length],
    spark: SPARKS[seed % SPARKS.length],
  };
}

function LoginContent() {
  const router = useRouter();
  const [daily] = useState(() => getDailyLoginContent(new Date()));
  const [email, setEmail] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, passphrase }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || 'Wrong email or passphrase. @toasttab.com accounts only.');
        setSubmitting(false);
      }
    } catch {
      setError('Something went wrong. Try again.');
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 8, color: '#fff', fontSize: 14,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0a', gap: 20, padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(255,76,0,0.15)', border: '1px solid rgba(255,76,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
            <path fillRule="evenodd" clipRule="evenodd"
              d="M12 2C12 2 7 7.5 7 13a5 5 0 0010 0c0-2.5-1.5-4.5-3-6 0 2-1 3.5-2 4.5A3 3 0 019 13c0-3 3-11 3-11z"
              fill="#FF4C00" />
          </svg>
        </div>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#fff', letterSpacing: '-0.01em' }}>
          Tables <span style={{ color: '#FF4C00' }}>Rep</span>
        </span>
      </div>

      <div style={{
        background: '#141414', border: '1px solid #222',
        borderRadius: 16, padding: '28px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
        maxWidth: 380, width: '100%',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#FF4C00', fontFamily: 'monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            {daily.day}
          </p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{daily.greeting}</p>
          <p style={{ fontSize: 13, color: '#888' }}>Sign in to get your prep brief.</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#dc2626', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email"
            placeholder="you@toasttab.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Team passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            required
            autoComplete="current-password"
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', padding: '11px 20px',
              background: submitting ? 'rgba(255,76,0,0.5)' : '#FF4C00',
              color: '#fff', border: 'none', borderRadius: 10,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
              marginTop: 2,
            }}
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,76,0,0.05)', borderRadius: 8, borderLeft: '2px solid rgba(255,76,0,0.4)' }}>
          <p style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', lineHeight: 1.5, marginBottom: 3 }}>"{daily.quote.q}"</p>
          <p style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{daily.spark}</p>
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#333', textAlign: 'center' }}>
        @toasttab.com accounts only
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}