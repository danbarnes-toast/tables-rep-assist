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
    const data = repData[email] as { accounts?: Record<string, unknown>[] } | undefined;
    if (!data) return NextResponse.json({ error: 'no data for this rep', email }, { status: 404 });

    if (Array.isArray(data.accounts)) {
      data.accounts = data.accounts
        .filter((a) => !/placeholder|churn/i.test((a.name as string) ?? ''))
        .map((a) => {
          const dst = a.days_since_touchpoint as number | undefined;
          if (dst !== undefined && dst > 365) a.days_since_touchpoint = null;
          const dsr = a.days_since_rep_contact as number | undefined;
          if (dsr !== undefined && dsr > 365) a.days_since_rep_contact = null;
          return a;
        });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('accounts route:', err);
    return NextResponse.json({ error: 'failed to load rep data' }, { status: 500 });
  }
}