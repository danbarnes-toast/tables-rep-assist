'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
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
  const params = useSearchParams();
  const error = params.get('error');
  const [daily] = useState(() => getDailyLoginContent(new Date()));

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

        {error === 'AccessDenied' && (
          <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#dc2626', textAlign: 'center', width: '100%' }}>
            Only @toasttab.com accounts are allowed.
          </div>
        )}

        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%', padding: '11px 20px',
            background: '#fff', color: '#111',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontSize: 14, fontWeight: 500, fontFamily: 'inherit',
          }}
        >
          <svg width={18} height={18} viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.2 5.2C41 35.2 44 30 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Sign in with Google
        </button>

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