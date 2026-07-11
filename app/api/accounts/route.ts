import { NextRequest, NextResponse } from 'next/server';
import repData from '@/data/rep-accounts.json';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.toLowerCase();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const data = (repData as Record<string, unknown>)[email];
  if (!data) return NextResponse.json({ error: 'no data for this rep', email }, { status: 404 });

  return NextResponse.json(data);
}
