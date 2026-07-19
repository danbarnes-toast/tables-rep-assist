import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { ProductHealth } from '@/lib/platform-types';

export const maxDuration = 60;

const PREP_SYSTEM = `You are a pre-call intelligence engine for Toast Tables sales reps.
Your job: synthesize Chorus call history and deal state into a tight, actionable pre-call brief.

Rules:
- Be concrete and specific. Name the people, dates, and commitments you find.
- Never be generic. "Follow up on open items" is useless. "Confirm Nadine approved the quote Tanguy sent on Jun 18" is useful.
- Predicted objections must be grounded in what was actually said in the calls, not guessed.
- The suggested opening must be a specific first sentence the rep can literally say on the call.
- The one close must be a concrete next step, not a goal.
- Output valid JSON exactly matching the schema. No markdown, no preamble, no explanation outside the JSON.`;

interface PrepRequest {
  repName: string;
  repTeam: string;
  account: {
    name: string;
    city: string;
    state: string;
    signed_date: string;
    activation_status: string;
    is_activated: boolean;
    bookings_90d: number;
    current_booking_platform?: string;
    chorus_calls?: {
      call_date: string;
      summary: string;
      action_items: string;
    }[];
    products?: ProductHealth[];
    days_since_touchpoint?: number;
    open_support_tickets?: number;
    total_arr?: number;
    account_health?: 'healthy' | 'at_risk' | 'cancel_risk';
    locations?: number;
  };
}

function buildPrepPrompt(req: PrepRequest): string {
  const { repName, repTeam, account } = req;

  const callsText = (account.chorus_calls ?? []).map(c => {
    const summary = c.summary.replace(/<[^>]+>/g, ' ').trim();
    let items: string[] = [];
    try { items = JSON.parse(c.action_items) as string[]; }
    catch { if (c.action_items) items = [c.action_items]; }
    return `--- Call: ${c.call_date} ---\nSummary: ${summary}\nAction items:\n${items.map(i => `- ${i}`).join('\n')}`;
  }).join('\n\n');

  const competitor = account.current_booking_platform && account.current_booking_platform !== 'None'
    ? account.current_booking_platform : 'None';

  let productSummary = '';
  if (account.products && account.products.length > 0) {
    const purchased = account.products.filter(p => p.status !== 'not_purchased');
    const atRisk = purchased.filter(p => ['live_stalled', 'live_at_risk', 'purchased_not_activated'].includes(p.status));
    const expansion = account.products.filter(p => p.status === 'not_purchased');
    productSummary = `\nPRODUCT PORTFOLIO:\n`;
    purchased.forEach(p => {
      productSummary += `- ${p.product}: ${p.status}`;
      if (p.notes) productSummary += ` (${p.notes})`;
      productSummary += '\n';
    });
    if (atRisk.length > 0) productSummary += `AT-RISK: ${atRisk.map(p => p.product).join(', ')}\n`;
    if (expansion.length > 0) productSummary += `NOT PURCHASED (expansion): ${expansion.map(p => p.product).join(', ')}\n`;
  }

  const locStr = account.locations && account.locations > 1 ? ` (${account.locations} locations)` : '';
  const arrStr = account.total_arr ? ` | ARR: $${account.total_arr.toLocaleString()}` : '';
  const touchStr = account.days_since_touchpoint !== undefined ? ` | Days since touchpoint: ${account.days_since_touchpoint}` : '';
  const ticketStr = account.open_support_tickets ? ` | Open tickets: ${account.open_support_tickets}` : '';
  const healthStr = account.account_health ? ` | Health: ${account.account_health}` : '';

  return `Rep: ${repName} (${repTeam})
Account: ${account.name} - ${account.city}, ${account.state}${locStr}
Signed: ${account.signed_date} | Status: ${account.activation_status} | Competitor: ${competitor}${healthStr}
Bookings (90d): ${account.bookings_90d}${arrStr}${touchStr}${ticketStr}
${productSummary}
CALL HISTORY:
${callsText || 'No call history available.'}

Generate a pre-call brief as JSON with exactly this shape:
{
  "situation": "2-3 sentence snapshot: who they are, where they are in the process, ALL active products and their health, what matters most right now",
  "discussed": [
    "bullet: specific thing discussed in calls - name people and dates",
    ...
  ],
  "open_commitments": [
    {
      "owner": "rep name | customer contact name",
      "item": "specific outstanding action item",
      "status": "pending | likely_done | unknown"
    },
    ...
  ],
  "predicted_objections": [
    {
      "objection": "the exact objection the customer might raise",
      "counter": "the specific response grounded in what was said in the calls"
    },
    ...
  ],
  "suggested_opening": "The exact first sentence to open this call. Specific, warm, references something from the last call or a specific product metric.",
  "one_close": "The single most important next step to get today. Specific action, not a goal. If a product is at risk, prioritize retention over expansion.",
  "confidence": "high | medium | low",
  "confidence_reason": "why confidence is high/medium/low and what information is missing or solid"
}`;
}

export async function POST(req: Request) {
  const body = await req.json() as PrepRequest;

  if (!body.account) {
    return Response.json({ error: 'account required' }, { status: 400 });
  }

  const prompt = buildPrepPrompt(body);

  const { text } = await generateText({
    model: openai('gpt-4o'),
    system: PREP_SYSTEM,
    prompt,
  });

  // Strip any markdown code fences if the model adds them
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    const brief = JSON.parse(cleaned) as Record<string, unknown>;
    return Response.json({ brief });
  } catch {
    return Response.json({ error: 'Failed to parse brief', raw: text }, { status: 500 });
  }
}
