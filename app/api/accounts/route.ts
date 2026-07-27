import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

async function loadRepData(): Promise<Record<string, unknown>> {
  const raw = await readFile(join(process.cwd(), 'data', 'rep-accounts.json'), 'utf-8');
  return JSON.parse(raw);
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.toLowerCase();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  try {
    const repData = await loadRepData();
    const data = repData[email];
    if (!data) return NextResponse.json({ error: 'no data for this rep', email }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('accounts route:', err);
    return NextResponse.json({ error: 'failed to load rep data' }, { status: 500 });
  }
}