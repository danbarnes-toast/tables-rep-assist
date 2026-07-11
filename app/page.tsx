'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { RepContext, AccountContext } from '@/lib/system-prompt';

type Mode = 'ask' | 'train' | 'prep' | 'accounts';

// --- Markdown renderer ---
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
        parts.push(<strong key={key++} className="font-semibold text-gray-900">{seg.slice(2, -2)}</strong>);
      } else if (seg.startsWith('`') && seg.endsWith('`')) {
        parts.push(<code key={key++} className="bg-gray-200 text-gray-800 rounded px-1 text-xs font-mono">{seg.slice(1, -1)}</code>);
      } else if (seg === '___CONFIRM___') {
        parts.push(<span key={key++} className="inline-block bg-amber-100 text-amber-700 text-xs font-medium px-1.5 py-0.5 rounded ml-1">CONFIRM WITH PM</span>);
      } else if (seg === '___EXTOK___') {
        parts.push(<span key={key++} className="inline-block bg-green-100 text-green-700 text-xs font-medium px-1.5 py-0.5 rounded ml-1">External OK</span>);
      } else if (seg === '___INTONLY___') {
        parts.push(<span key={key++} className="inline-block bg-red-100 text-red-700 text-xs font-medium px-1.5 py-0.5 rounded ml-1">Internal only</span>);
      } else {
        parts.push(<span key={key++}>{seg}</span>);
      }
    }
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { elements.push(<div key={i} className="h-2" />); i++; continue; }
    if (line.startsWith('## ')) { elements.push(<p key={i} className="font-semibold text-gray-900 text-sm mt-3 mb-1">{line.slice(3)}</p>); i++; continue; }
    if (line.startsWith('### ')) { elements.push(<p key={i} className="font-medium text-gray-700 text-sm mt-2">{line.slice(4)}</p>); i++; continue; }
    if (line.startsWith('> ')) {
      elements.push(<blockquote key={i} className="border-l-2 border-orange-300 pl-3 text-gray-600 italic text-sm my-1">{renderInline(line.slice(2))}</blockquote>);
      i++; continue;
    }
    if (line.match(/^[-*] /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) { items.push(<li key={i}>{renderInline(lines[i].slice(2))}</li>); i++; }
      elements.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 text-sm my-1 text-gray-800">{items}</ul>);
      continue;
    }
    if (line.match(/^\d+\. /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(<li key={i}>{renderInline(lines[i].replace(/^\d+\. /, ''))}</li>); i++; }
      elements.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-0.5 text-sm my-1 text-gray-800">{items}</ol>);
      continue;
    }
    elements.push(<p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>);
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

// --- Types ---
interface ChorusCall {
  call_date: string;
  participants: string;
  summary: string;
  action_items: string;
}
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
  accounts: Account[]; similar_accounts: SimilarAccount[];
}

// --- Helpers ---
function buildAccountPayload(acct: Account): AccountContext {
  return {
    name: acct.name,
    city: acct.city,
    state: acct.state,
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
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// --- Prep brief types ---
interface OpenCommitment {
  owner: string;
  item: string;
  status: 'pending' | 'likely_done' | 'unknown';
}
interface PredictedObjection {
  objection: string;
  counter: string;
}
interface PrepBrief {
  situation: string;
  discussed: string[];
  open_commitments: OpenCommitment[];
  predicted_objections: PredictedObjection[];
  suggested_opening: string;
  one_close: string;
  confidence: 'high' | 'medium' | 'low';
  confidence_reason: string;
}

// --- Prep tab ---
function PrepTab({
  repData,
  selectedAccountIdx,
  setSelectedAccountIdx,
}: {
  repData: RepData | null;
  selectedAccountIdx: number | null;
  setSelectedAccountIdx: (idx: number | null) => void;
}) {
  const [brief, setBrief] = useState<PrepBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAccountIdx, setLastAccountIdx] = useState<number | null>(null);

  const selectedAccount = selectedAccountIdx !== null ? (repData?.accounts[selectedAccountIdx] ?? null) : null;

  const generateBrief = async (accountIdx: number) => {
    if (!repData) return;
    const account = repData.accounts[accountIdx];
    setLoading(true);
    setError(null);
    setBrief(null);
    setLastAccountIdx(accountIdx);
    try {
      const res = await fetch('/api/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repName: repData.rep_name,
          repTeam: repData.team,
          account: {
            name: account.name,
            city: account.city,
            state: account.state,
            signed_date: account.signed_date,
            activation_status: account.activation_status,
            is_activated: account.is_activated,
            bookings_90d: account.bookings_90d,
            current_booking_platform: account.current_booking_platform,
            chorus_calls: (account.chorus_calls ?? []).map(c => ({
              call_date: c.call_date,
              summary: c.summary,
              action_items: c.action_items,
            })),
          },
        }),
      });
      const data = await res.json() as { brief?: PrepBrief; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.brief) setBrief(data.brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate brief');
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor = {
    high: 'bg-green-100 text-green-700 border-green-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-red-100 text-red-700 border-red-200',
  };

  const commitmentStatusIcon = {
    pending: { icon: '○', color: 'text-amber-600' },
    likely_done: { icon: '✓', color: 'text-green-600' },
    unknown: { icon: '?', color: 'text-gray-400' },
  };

  if (!repData) {
    return (
      <div className="pt-12 text-center text-sm text-gray-400">
        Loading your account data...
      </div>
    );
  }

  return (
    <div className="space-y-5 py-4">
      {/* Account picker */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Pre-Call Brief</h2>
        <div className="space-y-2">
          {repData.accounts.map((acct, i) => {
            const isSelected = selectedAccountIdx === i;
            const hasCall = (acct.chorus_calls?.length ?? 0) > 0;
            return (
              <button
                key={acct.name}
                onClick={() => {
                  setSelectedAccountIdx(i);
                  if (lastAccountIdx !== i) generateBrief(i);
                }}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  isSelected
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{acct.name}</p>
                    <p className="text-xs text-gray-400">{acct.city}, {acct.state} · {acct.activation_status}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasCall && (
                      <span className="text-xs text-blue-500 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                        {acct.chorus_calls!.length} call{acct.chorus_calls!.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{isSelected ? '▼' : '▶'}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && selectedAccount && (
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-100 rounded-2xl px-5 py-4">
            <p className="text-xs text-orange-500 font-medium mb-1">Generating brief for {selectedAccount.name}...</p>
            <p className="text-xs text-gray-400">Synthesizing {selectedAccount.chorus_calls?.length ?? 0} call{(selectedAccount.chorus_calls?.length ?? 0) !== 1 ? 's' : ''} + deal context</p>
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border border-gray-100 rounded-xl px-5 py-4 space-y-2">
              <div className="h-3 bg-gray-100 rounded w-24 animate-pulse" />
              <div className="h-3 bg-gray-100 rounded w-full animate-pulse" />
              <div className="h-3 bg-gray-100 rounded w-3/4 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
          <button
            onClick={() => selectedAccountIdx !== null && generateBrief(selectedAccountIdx)}
            className="ml-3 text-xs text-red-500 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Brief */}
      {brief && selectedAccount && !loading && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{selectedAccount.name}</p>
              <p className="text-xs text-gray-400">
                {selectedAccount.city}, {selectedAccount.state} ·{' '}
                {selectedAccount.chorus_calls?.length ?? 0} calls synthesized ·{' '}
                {selectedAccount.activation_status}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${confidenceColor[brief.confidence]}`}>
                {brief.confidence} confidence
              </span>
              <button
                onClick={() => selectedAccountIdx !== null && generateBrief(selectedAccountIdx)}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Situation */}
          <div className="bg-orange-50 border border-orange-100 rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">Situation</p>
            <p className="text-sm text-gray-800 leading-relaxed">{brief.situation}</p>
            {brief.confidence_reason && (
              <p className="text-xs text-gray-400 mt-2 italic">{brief.confidence_reason}</p>
            )}
          </div>

          {/* Suggested opening */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Open with this</p>
            <p className="text-sm text-gray-900 leading-relaxed font-medium">&ldquo;{brief.suggested_opening}&rdquo;</p>
          </div>

          {/* What's been discussed */}
          {brief.discussed.length > 0 && (
            <div className="border border-gray-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">What&apos;s been discussed</p>
              <ul className="space-y-2">
                {brief.discussed.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-gray-300 mt-0.5 flex-shrink-0">•</span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Open commitments */}
          {brief.open_commitments.length > 0 && (
            <div className="border border-gray-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Open commitments</p>
              <div className="space-y-2">
                {brief.open_commitments.map((c, i) => {
                  const st = commitmentStatusIcon[c.status];
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <span className={`text-sm font-bold flex-shrink-0 mt-0.5 ${st.color}`}>{st.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-gray-500 mr-1.5">{c.owner}</span>
                        <span className="text-sm text-gray-700 leading-relaxed">{c.item}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span className="text-amber-600 font-bold">○</span> pending
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span className="text-green-600 font-bold">✓</span> likely done
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span className="text-gray-400 font-bold">?</span> unknown
                </div>
              </div>
            </div>
          )}

          {/* Predicted objections */}
          {brief.predicted_objections.length > 0 && (
            <div className="border border-gray-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Likely objections</p>
              <div className="space-y-4">
                {brief.predicted_objections.map((obj, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="text-xs bg-red-50 text-red-600 border border-red-100 rounded px-1.5 py-0.5 font-medium flex-shrink-0 mt-0.5">them</span>
                      <p className="text-sm text-gray-800 font-medium leading-relaxed">&ldquo;{obj.objection}&rdquo;</p>
                    </div>
                    <div className="flex items-start gap-2 ml-1">
                      <span className="text-xs bg-green-50 text-green-600 border border-green-100 rounded px-1.5 py-0.5 font-medium flex-shrink-0 mt-0.5">you</span>
                      <p className="text-sm text-gray-600 leading-relaxed">{obj.counter}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* One close */}
          <div className="bg-gray-900 rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">One thing to close on</p>
            <p className="text-sm text-white font-medium leading-relaxed">{brief.one_close}</p>
          </div>
        </div>
      )}

      {/* Empty state — no account selected */}
      {!selectedAccount && !loading && !brief && (
        <div className="pt-4 text-center text-sm text-gray-400">
          Select an account above to generate a pre-call brief.
        </div>
      )}
    </div>
  );
}

// --- Accounts tab ---
function AccountsTab({ data }: { data: RepData }) {
  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">{data.rep_name}</p>
          <p className="text-xs text-gray-400">{data.team} · {data.region} · Data: {data.seeded_at}</p>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Your Accounts</h2>
        <div className="space-y-3">
          {data.accounts.map(acct => {
            const days = acct.is_activated ? null : daysSince(acct.signed_date);
            const nextAction = (() => {
              if (acct.is_activated) return null;
              if (days === null) return null;
              if (days < 7) return { text: 'Schedule setup call', color: 'text-blue-600 bg-blue-50 border-blue-100' };
              if (days < 14) return { text: 'Setup call overdue - check in', color: 'text-amber-700 bg-amber-50 border-amber-100' };
              return { text: 'At risk - follow up now', color: 'text-red-700 bg-red-50 border-red-100' };
            })();

            return (
              <div key={acct.name} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{acct.name}</p>
                    <p className="text-xs text-gray-400">{acct.city}, {acct.state} · Signed {acct.signed_date}</p>
                    {acct.current_booking_platform && acct.current_booking_platform !== 'None' && (
                      <span className="inline-block mt-1 bg-purple-100 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        on {acct.current_booking_platform}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      acct.is_activated
                        ? 'bg-green-100 text-green-700'
                        : acct.activation_status === 'Backlog'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {acct.is_activated ? 'Activated' : acct.activation_status}
                    </span>
                    {days !== null && (
                      <span className="text-xs text-gray-400">Day {days} / 30</span>
                    )}
                  </div>
                </div>

                {nextAction && (
                  <div className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${nextAction.color}`}>
                    {nextAction.text}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-semibold text-gray-900">{acct.bookings_90d.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">bookings (90d)</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-semibold text-gray-900">{acct.covers_90d.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">covers (90d)</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-semibold text-gray-900">{acct.last_booking_date ?? '—'}</p>
                    <p className="text-xs text-gray-400">last booking</p>
                  </div>
                </div>
                {acct.note && <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{acct.note}</p>}

                {acct.chorus_calls && acct.chorus_calls.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Last Chorus Calls</p>
                    {acct.chorus_calls.map((call, idx) => {
                      const actionItems = (() => {
                        try { return JSON.parse(call.action_items) as string[]; }
                        catch { return call.action_items ? [call.action_items] : []; }
                      })();
                      return (
                        <div key={idx} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 space-y-1.5">
                          <p className="text-xs text-blue-500 font-medium">{call.call_date}</p>
                          {call.summary && (
                            <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{
                              call.summary.replace(/<br>/gi, ' ').replace(/Action Items:[\s\S]*?Meeting Summary:/, 'Meeting Summary:').trim()
                            }</p>
                          )}
                          {actionItems.length > 0 && (
                            <div className="space-y-0.5">
                              <p className="text-xs font-medium text-gray-500">Action items:</p>
                              <ul className="list-disc list-inside space-y-0.5">
                                {actionItems.slice(0, 3).map((item, i) => (
                                  <li key={i} className="text-xs text-gray-600">{item}</li>
                                ))}
                                {actionItems.length > 3 && <li className="text-xs text-gray-400">+{actionItems.length - 3} more</li>}
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
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Similar Active Accounts in Your Region</h2>
          <p className="text-xs text-gray-400 mb-3">Use these as proof points — "Here's what a similar restaurant nearby is doing with Tables."</p>
          <div className="space-y-2">
            {data.similar_accounts.map(a => (
              <div key={a.name} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-800">{a.name}</p>
                  <p className="text-xs text-gray-400">{a.city}, {a.state}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{a.bookings_90d.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">bookings / 90d</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Suggestions ---
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
    'Give me an intro to Toast Tables — what is it and who buys it?',
    'Walk me through a full sales qualification conversation',
    'Teach me the OpenTable competitive objection cold',
    'What are the most common reasons deals stall?',
    'Show me a case study for a fine dining prospect',
    'How does activation work after a restaurant signs?',
  ],
};

// --- Identity prompt ---
function IdentityGate({ onConfirm }: { onConfirm: (email: string) => void }) {
  const [email, setEmail] = useState('');
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-4">
        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-lg mx-auto">T</div>
          <p className="font-semibold text-gray-900">Tables Rep Assist</p>
          <p className="text-sm text-gray-400">Enter your Toast email to get started</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (email.includes('@')) onConfirm(email.toLowerCase().trim()); }}
          className="space-y-3">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@toasttab.com"
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
            autoFocus
          />
          <button type="submit" disabled={!email.includes('@')}
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}

function parseSuggestions(text: string): { display: string; suggestions: string[] } {
  const match = text.match(/<suggestions>([\s\S]*?)<\/suggestions>/);
  if (!match) return { display: text, suggestions: [] };
  const suggestions = match[1]
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  return { display: text.replace(/<suggestions>[\s\S]*?<\/suggestions>/, '').trimEnd(), suggestions };
}

// --- Chat pane (keyed per mode so history resets on tab switch) ---
function ChatPane({
  mode,
  repData,
  selectedAccountIdx,
  setSelectedAccountIdx,
}: {
  mode: 'ask' | 'train';
  repData: RepData | null;
  selectedAccountIdx: number | null;
  setSelectedAccountIdx: (idx: number | null) => void;
}) {
  const { messages, sendMessage, status: chatStatus } = useChat({ id: mode });
  const [input, setInput] = useState('');
  const isLoading = chatStatus === 'streaming' || chatStatus === 'submitted';
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedAccount = selectedAccountIdx !== null ? (repData?.accounts[selectedAccountIdx] ?? null) : null;

  // Keep a ref always-current so context is fresh at send time
  const contextRef = useRef<{ repContext?: RepContext; accountContext?: AccountContext }>({});
  contextRef.current = {
    repContext: repData ? { rep_name: repData.rep_name, team: repData.team, region: repData.region } : undefined,
    accountContext: selectedAccount ? buildAccountPayload(selectedAccount) : undefined,
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const submit = (text: string) => {
    if (!text.trim()) return;
    sendMessage(
      { role: 'user', parts: [{ type: 'text', text }] },
      { body: contextRef.current }
    );
    setInput('');
  };

  const firstName = repData?.rep_name.split(' ')[0] ?? null;

  return (
    <>
      {/* Account selector strip */}
      {repData && repData.accounts.length > 0 && (
        <div className="border-b border-gray-100 px-4 py-2 bg-gray-50 flex-shrink-0">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <span className="text-xs text-gray-400 whitespace-nowrap">Working on:</span>
            <select
              value={selectedAccountIdx ?? ''}
              onChange={e => setSelectedAccountIdx(e.target.value !== '' ? Number(e.target.value) : null)}
              className="text-xs text-gray-700 bg-transparent border-none focus:outline-none cursor-pointer flex-1"
            >
              <option value="">Select account for personalized tips...</option>
              {repData.accounts.map((a, i) => (
                <option key={i} value={i}>{a.name} - {a.activation_status}</option>
              ))}
            </select>
            {selectedAccount && (
              <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:block">
                {selectedAccount.city}, {selectedAccount.state} ·{' '}
                {selectedAccount.current_booking_platform && selectedAccount.current_booking_platform !== 'None'
                  ? `on ${selectedAccount.current_booking_platform}`
                  : 'no competitor'}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="space-y-4 pt-2">
              {/* Greeting card */}
              {repData && (
                <div className="bg-orange-50 border border-orange-100 rounded-2xl px-5 py-4">
                  <p className="font-semibold text-gray-900 text-sm">
                    Hey {firstName} -
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {repData.accounts.length === 1
                      ? `1 account in your pipeline.`
                      : `${repData.accounts.length} accounts in your pipeline.`
                    }{' '}
                    {selectedAccount
                      ? `Working on ${selectedAccount.name}.`
                      : 'Select an account above for a personalized pitch.'}
                  </p>
                </div>
              )}
              {!repData && (
                <p className="text-gray-400 text-sm text-center">
                  {mode === 'ask' ? 'In-call assist - ask anything' : 'Learn the product, objections, and case studies'}
                </p>
              )}
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide px-1">Try asking</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS[mode].map((s) => (
                  <button key={s} onClick={() => submit(s)}
                    className="text-left text-sm text-gray-700 border border-gray-200 rounded-xl px-4 py-3 hover:bg-orange-50 hover:border-orange-200 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, msgIdx) => {
            const rawText = message.parts.filter(p => p.type === 'text')
              .map(p => (p as { type: 'text'; text: string }).text).join('');
            const isLastAssistant = message.role === 'assistant' && !isLoading &&
              messages.slice(msgIdx + 1).every(m => m.role !== 'assistant');
            const { display, suggestions } = message.role === 'assistant'
              ? parseSuggestions(rawText)
              : { display: rawText, suggestions: [] };
            return (
              <div key={message.id} className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>
                  {message.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 flex-shrink-0">T</div>
                  )}
                  <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                    message.role === 'user' ? 'bg-orange-500 text-white text-sm' : 'bg-gray-50 border border-gray-200 text-gray-900'
                  }`}>
                    {message.role === 'user' ? <span className="text-sm">{display}</span> : <Markdown text={display} />}
                  </div>
                </div>
                {isLastAssistant && suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 ml-9">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => submit(s)}
                        className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5 hover:bg-orange-100 transition-colors font-medium">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">T</div>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-gray-200 px-4 py-4 flex-shrink-0">
        <form onSubmit={e => { e.preventDefault(); submit(input); }} className="max-w-3xl mx-auto flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)}
            placeholder={mode === 'ask' ? 'Ask about features, objections, or customer examples...' : 'Ask me to teach you anything about Toast Tables...'}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
            disabled={isLoading} />
          <button type="submit" disabled={isLoading || !input.trim()}
            className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors">
            Send
          </button>
        </form>
      </div>
    </>
  );
}

// --- Main ---
export default function Home() {
  const [mode, setMode] = useState<Mode>('ask');
  const [repEmail, setRepEmail] = useState<string | null>(null);
  const [repData, setRepData] = useState<RepData | null>(null);
  const [selectedAccountIdx, setSelectedAccountIdx] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('rep_email');
    if (stored) setRepEmail(stored);
  }, []);

  useEffect(() => {
    if (!repEmail) return;
    fetch(`/api/accounts?email=${encodeURIComponent(repEmail)}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setRepData(d as RepData); })
      .catch(() => {});
  }, [repEmail]);

  const handleIdentity = useCallback((email: string) => {
    localStorage.setItem('rep_email', email);
    setRepEmail(email);
  }, []);

  const firstName = repData?.rep_name.split(' ')[0];

  if (!repEmail) return (
    <div className="h-screen flex flex-col bg-white">
      <IdentityGate onConfirm={handleIdentity} />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            {firstName && (
              <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {firstName[0].toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-gray-900">Tables Rep Assist</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Jul 2026</span>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['ask', 'train', 'prep', 'accounts'] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {m === 'accounts' ? 'Pipeline' : m === 'ask' ? 'Ask' : m === 'train' ? 'Train' : 'Prep'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {mode === 'accounts' ? (
        <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
          {repData ? (
            <AccountsTab data={repData} />
          ) : (
            <div className="pt-12 text-center space-y-2">
              <p className="text-sm text-gray-500">No account data found for <span className="font-mono text-xs">{repEmail}</span>.</p>
              <p className="text-xs text-gray-400">Ask Dan to run <code className="bg-gray-100 px-1 rounded">seed_rep_accounts.py --rep {repEmail} --write</code></p>
            </div>
          )}
        </div>
      ) : mode === 'prep' ? (
        <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
          <PrepTab
            repData={repData}
            selectedAccountIdx={selectedAccountIdx}
            setSelectedAccountIdx={setSelectedAccountIdx}
          />
        </div>
      ) : (
        <ChatPane
          key={mode}
          mode={mode as 'ask' | 'train'}
          repData={repData}
          selectedAccountIdx={selectedAccountIdx}
          setSelectedAccountIdx={setSelectedAccountIdx}
        />
      )}
    </div>
  );
}
