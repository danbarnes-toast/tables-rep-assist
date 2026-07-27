import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages } from 'ai';
import { buildSystemPrompt } from '@/lib/system-prompt';
import { chatLimiter } from '@/lib/rate-limit';
import { ChatBodySchema } from '@/lib/chat-schema';
import type { RepContext, AccountContext } from '@/lib/platform-types';

export const maxDuration = 300;

export async function POST(req: Request) {
  const sessionToken = req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1] ?? 'anon';
  const { allowed } = chatLimiter.check(sessionToken);
  if (!allowed) return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const raw = await req.json();
  const parsed = ChatBodySchema.safeParse(Array.isArray(raw) ? { messages: raw } : raw);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const uiMessages = body.messages ?? [];
  const messages = await convertToModelMessages(uiMessages);

  const language: string | undefined = body.language;
  const repContext = body.repContext
    ? { ...body.repContext, language: language ?? body.repContext.language } as RepContext
    : undefined;
  const accountContext = (body.accountContext ?? undefined) as AccountContext | undefined;
  const runtime: Record<string, string> | undefined = body.runtime ?? undefined;
  const system = buildSystemPrompt({ repContext, accountContext, runtime });

  const result = streamText({
    model: openai('gpt-4o'),
    system,
    messages,
    maxOutputTokens: 4096,
  });

  return result.toUIMessageStreamResponse();
}
