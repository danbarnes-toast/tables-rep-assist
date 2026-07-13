import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const SESSION_COOKIE = 'mise_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET not set');
  return s;
}

async function sign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Buffer.from(sig).toString('base64url');
}

export async function createSession(email: string): Promise<string> {
  const payload = JSON.stringify({ email, exp: Date.now() + SESSION_MAX_AGE * 1000 });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = await sign(b64, getSecret());
  return `${b64}.${sig}`;
}

export async function verifySession(token: string): Promise<{ email: string } | null> {
  try {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return null;
    const expected = await sign(b64, getSecret());
    if (expected !== sig) return null;
    const { email, exp } = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (Date.now() > exp) return null;
    return { email };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<{ email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function getSessionFromRequest(req: NextRequest): Promise<{ email: string } | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export { SESSION_COOKIE, SESSION_MAX_AGE };