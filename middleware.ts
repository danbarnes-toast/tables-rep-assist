import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';

const PUBLIC = ['/login', '/api/login', '/api/logout'];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some(p => path.startsWith(p))) return NextResponse.next();
  if (path.startsWith('/_next') || path.startsWith('/favicon')) return NextResponse.next();

  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};