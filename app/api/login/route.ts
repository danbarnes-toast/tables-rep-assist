import { NextRequest, NextResponse } from 'next/server';
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { email, passphrase } = await req.json();

  const normalizedEmail = (email ?? '').toLowerCase().trim();
  const correct = process.env.AUTH_PASSPHRASE ?? '';

  if (!normalizedEmail.endsWith('@toasttab.com')) {
    return NextResponse.json({ error: 'toasttab accounts only' }, { status: 401 });
  }
  if (!correct || passphrase !== correct) {
    return NextResponse.json({ error: 'Wrong passphrase' }, { status: 401 });
  }

  const token = await createSession(normalizedEmail);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return res;
}