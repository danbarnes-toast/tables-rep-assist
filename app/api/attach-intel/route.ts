import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';

const ENABLED = process.env.ATTACH_INTEL_ENABLED !== 'false';

// In-memory cache: key = "email:refMonth", TTL = 8 hours
// At pilot scale (1-2 AMs) this prevents redundant Snowflake queries across
// tab switches / reloads without any external infra.
// Upgrade path: replace with Vercel KV (Redis) when rolling out to full AM org.
const _cache = new Map<string, { value: ReturnType<typeof queryPersonalRates>; expiresAt: number }>();
const CACHE_TTL_MS = 8 * 60 * 60 * 1000;

function cachedQuery(email: string, refMonth: string) {
  const key = `${email}:${refMonth}`;
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const result = queryPersonalRates(email, refMonth);
  _cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

interface BenchmarkProduct {
  key: string;
  name: string;
  medianPct: number;
  topDecilePct: number;
}

interface Benchmarks {
  ref_month: string;
  generated_at: string;
  am_count: number;
  products: BenchmarkProduct[];
}

interface AttachProduct {
  key: string;
  name: string;
  myPct: number;
  myAttached: number;
  totalAccts: number;
  medianPct: number;
  topDecilePct: number;
  gapToMedian: number;
  gapToTopDecile: number;
}

async function loadBenchmarks(): Promise<Benchmarks> {
  const raw = await readFile(join(process.cwd(), 'data', 'cohort_benchmarks.json'), 'utf-8');
  return JSON.parse(raw);
}

function queryPersonalRates(email: string, refMonth: string): {
  oo: number; xc: number; mkt: number; loyalty: number;
  ooAttached: number; xcAttached: number; mktAttached: number; loyaltyAttached: number;
  totalAccts: number;
} | null {
  const sql = `
WITH am_accts AS (
    SELECT ao.SALESFORCE_ACCOUNTID
    FROM TOAST.ANALYTICS_CORE.MONTHLY_ACCOUNT_OWNER ao
    JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT e
        ON e.SALESFORCE_USERID = ao.SALESFORCE_ACCOUNTOWNERID
    WHERE LOWER(e.EMAIL_ADDRESS) = '${email.toLowerCase().replace(/'/g, "''")}'
      AND ao.FIRSTDAYOFMONTH = '${refMonth}'
),
tables_accts AS (
    SELECT a.SALESFORCE_ACCOUNTID
    FROM am_accts a
    JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m
        ON m.SALESFORCE_ACCOUNTID = a.SALESFORCE_ACCOUNTID
        AND m.MODULE_NAME = 'Toast Tables'
        AND m.POS_STATUS = 'Live'
        AND m.FIRSTDAYOFMONTH = '${refMonth}'
        AND m.IS_INTERNATIONAL_CUSTOMER = FALSE
        AND m.CUSTOMER_MARKET_SEGMENT IN ('SMB', 'Mid-Market')
)
SELECT
    COUNT(DISTINCT t.SALESFORCE_ACCOUNTID) AS total_accts,
    COUNT(DISTINCT CASE WHEN m_oo.MODULE_NAME = 'Online Ordering' AND m_oo.POS_STATUS = 'Live'
                        THEN t.SALESFORCE_ACCOUNTID END) AS oo_attached,
    COUNT(DISTINCT CASE WHEN m_xc.MODULE_NAME LIKE '%xtraChef%' AND m_xc.POS_STATUS = 'Live'
                        THEN t.SALESFORCE_ACCOUNTID END) AS xc_attached,
    COUNT(DISTINCT CASE WHEN m_mkt.MODULE_NAME IN ('Marketing', 'SMS Marketing') AND m_mkt.POS_STATUS = 'Live'
                        THEN t.SALESFORCE_ACCOUNTID END) AS mkt_attached,
    COUNT(DISTINCT CASE WHEN m_loy.MODULE_NAME = 'Loyalty' AND m_loy.POS_STATUS = 'Live'
                        THEN t.SALESFORCE_ACCOUNTID END) AS loyalty_attached
FROM tables_accts t
LEFT JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m_oo
    ON m_oo.SALESFORCE_ACCOUNTID = t.SALESFORCE_ACCOUNTID
    AND m_oo.MODULE_NAME = 'Online Ordering'
    AND m_oo.FIRSTDAYOFMONTH = '${refMonth}'
LEFT JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m_xc
    ON m_xc.SALESFORCE_ACCOUNTID = t.SALESFORCE_ACCOUNTID
    AND m_xc.MODULE_NAME LIKE '%xtraChef%'
    AND m_xc.FIRSTDAYOFMONTH = '${refMonth}'
LEFT JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m_mkt
    ON m_mkt.SALESFORCE_ACCOUNTID = t.SALESFORCE_ACCOUNTID
    AND m_mkt.MODULE_NAME IN ('Marketing', 'SMS Marketing')
    AND m_mkt.FIRSTDAYOFMONTH = '${refMonth}'
LEFT JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m_loy
    ON m_loy.SALESFORCE_ACCOUNTID = t.SALESFORCE_ACCOUNTID
    AND m_loy.MODULE_NAME = 'Loyalty'
    AND m_loy.FIRSTDAYOFMONTH = '${refMonth}'
`;

  try {
    const wsDir = join(process.cwd(), '..', 'tables-pm-workspace');
    const escaped = sql.replace(/"/g, '\\"').replace(/\n/g, ' ');
    const result = execSync(
      `SNOWFLAKE_USER="$(git -C "${wsDir}" config user.email)" ${wsDir}/venv/bin/python3 -c "
import sys, json
sys.path.insert(0, '${wsDir}')
from snowflake_connector import quick_query
df = quick_query("""${escaped}""")
print(json.dumps(df.to_dict(orient='records')))
"`,
      { timeout: 30000, encoding: 'utf-8', cwd: wsDir }
    );
    const rows = JSON.parse(result.trim().split('\n').pop()!);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    const total = Number(r.TOTAL_ACCTS ?? r.total_accts ?? 0);
    if (total === 0) return null;
    const ooA = Number(r.OO_ATTACHED ?? r.oo_attached ?? 0);
    const xcA = Number(r.XC_ATTACHED ?? r.xc_attached ?? 0);
    const mktA = Number(r.MKT_ATTACHED ?? r.mkt_attached ?? 0);
    const loyA = Number(r.LOYALTY_ATTACHED ?? r.loyalty_attached ?? 0);
    return {
      totalAccts: total,
      ooAttached: ooA, oo: Math.round(ooA * 100 / total * 10) / 10,
      xcAttached: xcA, xc: Math.round(xcA * 100 / total * 10) / 10,
      mktAttached: mktA, mkt: Math.round(mktA * 100 / total * 10) / 10,
      loyaltyAttached: loyA, loyalty: Math.round(loyA * 100 / total * 10) / 10,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!ENABLED) {
    return NextResponse.json({ enabled: false });
  }

  const email = req.nextUrl.searchParams.get('email');
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  let benchmarks: Benchmarks;
  try {
    benchmarks = await loadBenchmarks();
  } catch {
    return NextResponse.json({ error: 'benchmarks unavailable' }, { status: 503 });
  }

  const refMonth = benchmarks.ref_month;
  const personal = cachedQuery(email, refMonth);

  if (!personal) {
    // Return benchmarks only - AM not found in Snowflake (demo accounts)
    return NextResponse.json({
      enabled: true,
      refMonth,
      amCount: benchmarks.am_count,
      totalAccts: null,
      products: benchmarks.products.map(p => ({
        key: p.key,
        name: p.name,
        myPct: null,
        myAttached: null,
        totalAccts: null,
        medianPct: p.medianPct,
        topDecilePct: p.topDecilePct,
        gapToMedian: null,
        gapToTopDecile: null,
      })),
    });
  }

  const keyMap: Record<string, { pct: number; attached: number }> = {
    oo:      { pct: personal.oo,      attached: personal.ooAttached },
    xc:      { pct: personal.xc,      attached: personal.xcAttached },
    mkt:     { pct: personal.mkt,     attached: personal.mktAttached },
    loyalty: { pct: personal.loyalty, attached: personal.loyaltyAttached },
  };

  const products: AttachProduct[] = benchmarks.products.map(p => {
    const my = keyMap[p.key];
    return {
      key: p.key,
      name: p.name,
      myPct: my.pct,
      myAttached: my.attached,
      totalAccts: personal.totalAccts,
      medianPct: p.medianPct,
      topDecilePct: p.topDecilePct,
      gapToMedian: Math.round((my.pct - p.medianPct) * 10) / 10,
      gapToTopDecile: Math.round((my.pct - p.topDecilePct) * 10) / 10,
    };
  });

  return NextResponse.json({
    enabled: true,
    refMonth,
    amCount: benchmarks.am_count,
    totalAccts: personal.totalAccts,
    products,
  });
}