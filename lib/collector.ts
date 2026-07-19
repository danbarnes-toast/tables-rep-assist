// =============================================================
// Toast Tables Platform - Personalization Collector
// Manages the intake modal: shows questions on first open,
// stores answers in sessionStorage (clears on tab close),
// exposes runtime context for injection into buildSystemPrompt.
//
// Persistence model: SESSION-scoped (not localStorage).
// Each new browser session re-prompts. This is intentional —
// the collector captures "what's on your mind right now",
// not a permanent preference.
// =============================================================

import type { CollectorQuestion, RuntimeContext } from './platform-types';

const COLLECTOR_KEY_PREFIX = 'collector_';

/**
 * Check whether the collector has been completed this session.
 */
export function isCollectorComplete(personaId: string): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(`${COLLECTOR_KEY_PREFIX}${personaId}_done`) === '1';
}

/**
 * Save collector answers and mark as complete for this session.
 */
export function saveCollectorAnswers(personaId: string, answers: RuntimeContext): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(`${COLLECTOR_KEY_PREFIX}${personaId}`, JSON.stringify(answers));
  sessionStorage.setItem(`${COLLECTOR_KEY_PREFIX}${personaId}_done`, '1');
}

/**
 * Load saved answers for this session. Returns null if not yet collected.
 */
export function loadCollectorAnswers(personaId: string): RuntimeContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${COLLECTOR_KEY_PREFIX}${personaId}`);
    return raw ? (JSON.parse(raw) as RuntimeContext) : null;
  } catch {
    return null;
  }
}

/**
 * Clear collector state — forces re-prompt on next render.
 */
export function resetCollector(personaId: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(`${COLLECTOR_KEY_PREFIX}${personaId}`);
  sessionStorage.removeItem(`${COLLECTOR_KEY_PREFIX}${personaId}_done`);
}

/**
 * Format collected answers into a system prompt block.
 * Injected into buildSystemPrompt as runtimeContext.
 */
export function formatRuntimeBlock(questions: CollectorQuestion[], answers: RuntimeContext): string {
  const lines = questions
    .filter(q => answers[q.key])
    .map(q => `- ${q.label}: ${answers[q.key]}`);
  if (!lines.length) return '';
  return `\n## What ${'\x27'}s on your mind right now\n${lines.join('\n')}\n`;
}