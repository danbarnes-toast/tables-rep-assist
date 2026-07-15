import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages } from 'ai';
import { buildSystemPrompt } from '@/lib/system-prompt';
import type { RepContext, AccountContext } from '@/lib/platform-types';

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json();
  const uiMessages = Array.isArray(body) ? body : (body.messages ?? []);
  const messages = await convertToModelMessages(uiMessages);

  const language: string | undefined = body.language;
  const repContext: RepContext | undefined = body.repContext
    ? { ...body.repContext, language: language ?? body.repContext.language }
    : undefined;
  const accountContext: AccountContext | undefined = body.accountContext ?? undefined;
  const system = buildSystemPrompt({ repContext, accountContext });

  const result = streamText({
    model: openai('gpt-4o'),
    system,
    messages,
    maxOutputTokens: 4096,
  });

  return result.toUIMessageStreamResponse();
}
