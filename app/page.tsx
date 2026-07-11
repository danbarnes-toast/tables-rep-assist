'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';

type Mode = 'ask' | 'train';

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (raw: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let remaining = raw;
    let key = 0;

    // Badge tags
    remaining = remaining.replace(/\[CONFIRM WITH PM\]/g, '___CONFIRM___');
    remaining = remaining.replace(/\[External OK\]/g, '___EXTOK___');
    remaining = remaining.replace(/\[Internal only\]/g, '___INTONLY___');

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

    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    if (line.startsWith('## ')) {
      elements.push(<p key={i} className="font-semibold text-gray-900 text-sm mt-3 mb-1">{line.slice(3)}</p>);
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      elements.push(<p key={i} className="font-medium text-gray-700 text-sm mt-2">{line.slice(4)}</p>);
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="border-l-2 border-orange-300 pl-3 text-gray-600 italic text-sm my-1">
          {renderInline(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    if (line.match(/^[-*] /)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        listItems.push(<li key={i}>{renderInline(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 text-sm my-1 text-gray-800">{listItems}</ul>);
      continue;
    }

    if (line.match(/^\d+\. /)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        const content = lines[i].replace(/^\d+\. /, '');
        listItems.push(<li key={i}>{renderInline(content)}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-0.5 text-sm my-1 text-gray-800">{listItems}</ol>);
      continue;
    }

    elements.push(<p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>);
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

const SUGGESTIONS: Record<Mode, string[]> = {
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

export default function Home() {
  const { messages, sendMessage, status: chatStatus } = useChat();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('ask');
  const isLoading = chatStatus === 'streaming' || chatStatus === 'submitted';
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const submit = (text: string) => {
    if (!text.trim()) return;
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] });
    setInput('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">Tables Rep Assist</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Jul 2026</span>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['ask', 'train'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors capitalize ${
                  mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'ask' ? 'Ask' : 'Train'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-3xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="space-y-4 pt-6">
            <p className="text-gray-400 text-sm text-center">
              {mode === 'ask' ? 'In-call assist — ask anything' : 'Learn the product, objections, and case studies'}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS[mode].map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="text-left text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2.5 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const text = message.parts
            .filter((p) => p.type === 'text')
            .map((p) => (p as { type: 'text'; text: string }).text)
            .join('');
          return (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 flex-shrink-0">
                  T
                </div>
              )}
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-orange-500 text-white text-sm'
                    : 'bg-gray-50 border border-gray-200 text-gray-900'
                }`}
              >
                {message.role === 'user' ? (
                  <span className="text-sm">{text}</span>
                ) : (
                  <Markdown text={text} />
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              T
            </div>
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

      <div className="border-t border-gray-200 px-4 py-4">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
          className="max-w-3xl mx-auto flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === 'ask' ? 'Ask about features, objections, or customer examples…' : 'Ask me to teach you anything about Toast Tables…'}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
