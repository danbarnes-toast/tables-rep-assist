import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages } from 'ai';
import { SYSTEM_PROMPT } from '@/lib/system-prompt';

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const uiMessages = Array.isArray(body) ? body : (body.messages ?? []);
  const messages = await convertToModelMessages(uiMessages);

  const result = streamText({
    model: openai('gpt-4o'),
    system: SYSTEM_PROMPT,
    messages,
  });

  return result.toUIMessageStreamResponse();
}
