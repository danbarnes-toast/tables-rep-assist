# Tables AM Assist - Data Pipeline

Owner: Dan Barnes (PM)
Last updated: Jul 2026
Status: Manual. Designed for handoff to an infer/data team.

---

## Overview

The app surfaces two types of data to each AM:

| Data type | Source | Refresh cadence | Script |
|-----------|--------|-----------------|--------|
| AM's rep book (accounts, health, signals) | Snowflake + Chorus | Weekly | `scripts/refresh_am_data.sh --weekly` |
| Cohort benchmarks (attach rate median + p90) | Snowflake | Monthly (after close) | `scripts/refresh_am_data.sh --monthly` |

Both are committed to the repo and deployed to Vercel. There is no live Snowflake query for benchmarks - they are precomputed. There is one live Snowflake query per session for the AM's personal attach rates (the Attach Intel Panel).

---

## Snowflake tables used

| Table | Used for |
|-------|----------|
| `TOAST.ANALYTICS_CORE.MONTHLY_ACCOUNT_OWNER` | Maps AM email to their account list for a given month |
| `TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT` | Resolves `SALESFORCE_ACCOUNTOWNERID` to `EMAIL_ADDRESS` |
| `TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR` | Module attach status per account per month |
| `TOAST.ANALYTICS_CORE_ARR.CURRENT_MODULE_ACTIVATION_ADOPTION` | Product activation + usage (IS_ACTIVATED, IS_ADOPTED, trailing 30d txns) |
| Chorus (via `seed_rep_accounts.py`) | Call history for touchpoint recency |

Key join path for AM identity:
```
AM email
  -> MONTHLY_ACCOUNT_OWNER (join: SALESFORCE_ACCOUNTOWNERID = EMPLOYEE_CURRENT.SALESFORCE_USERID)
  -> EMPLOYEE_CURRENT (field: EMAIL_ADDRESS)
  -> MONTHLY_ACCOUNT_OWNER.SALESFORCE_ACCOUNTID
  -> MONTHLY_CUSTOMER_MODULE_ARR
```

Do NOT use `ACCOUNT_INTERNAL_STAKEHOLDERS.ACCOUNT_OWNER_EMAIL` - the values are MD5 hashed.

Segment filters applied everywhere: `IS_INTERNATIONAL_CUSTOMER = FALSE`, `CUSTOMER_MARKET_SEGMENT IN ('SMB', 'Mid-Market')`.

---

## Pipeline 1: Rep book (weekly)

**Script:** `scripts/seed_rep_accounts.py` + `scripts/enrich_product_health.py`

**What it does:**
1. Pulls all accounts for the rep from `MONTHLY_ACCOUNT_OWNER` for the most recent closed month
2. Pulls Chorus call history (last 3 calls per account) - sets `days_since_touchpoint`
3. Pulls booking signals from `TOAST_TABLES_BOOKINGS` (90-day window)
4. Pulls activation status from `CURRENT_MODULE_ACTIVATION_ADOPTION`
5. Enriches product health per account (healthy / at_risk / cancel_risk) based on real activation data where available, RNG fallback for products with no Snowflake signal

**Output:** `data/rep-accounts.json` - one object per rep email, containing their full account list with all signals

**Run:**
```bash
cd ~/tables-pm-workspace
bash ../tables-am-assist/scripts/refresh_am_data.sh --weekly alexis.coutts@toasttab.com
```

**Cadence:** Weekly, Monday morning. Takes ~2 min per rep.

**Known gaps:**
- `days_since_touchpoint` = days since last Chorus-recorded call. Does not include email, in-person, or Salesloft cadences.
- Products without Snowflake signals (some Payroll SKUs, Toast Capital) fall back to estimated status.

---

## Pipeline 2: Cohort benchmarks (monthly)

**Script:** `scripts/compute_cohort_benchmarks.py`

**What it does:**
1. Queries `MONTHLY_ACCOUNT_OWNER` + `EMPLOYEE_CURRENT` + `MONTHLY_CUSTOMER_MODULE_ARR` for all active AMs with 10+ live Tables accounts in the last complete month
2. Computes median attach rate and 90th percentile per product across all qualifying AMs
3. Writes result to `data/cohort_benchmarks.json`

**Output:** `data/cohort_benchmarks.json`
```json
{
  "ref_month": "2026-06-01",
  "generated_at": "2026-07-16",
  "am_count": 272,
  "products": [
    { "key": "oo",      "name": "Online Ordering",  "medianPct": 90.0,  "topDecilePct": 100.0 },
    { "key": "xc",      "name": "xtraCHEF",          "medianPct": 30.0,  "topDecilePct": 56.1  },
    { "key": "mkt",     "name": "Toast Marketing",   "medianPct": 70.0,  "topDecilePct": 88.2  },
    { "key": "loyalty", "name": "Loyalty",           "medianPct": 72.7,  "topDecilePct": 90.0  }
  ]
}
```

**Run:**
```bash
cd ~/tables-pm-workspace
bash ../tables-am-assist/scripts/refresh_am_data.sh --monthly
```

The script auto-selects the last complete month - no manual date editing needed.

**Cadence:** Monthly, on the 3rd of the month (after Snowflake monthly close lands).

**After running:** Commit `data/cohort_benchmarks.json` and deploy:
```bash
cd ~/tables-am-assist
git add data/cohort_benchmarks.json
git commit -m "chore(data): update cohort benchmarks <month>"
npx vercel deploy --prod --scope team_bXpXgaYNc1uUbFex5Yxy6od6
```

---

## Live query: AM personal attach rates

**Route:** `app/api/attach-intel/route.ts`

**What it does:** Runs one Snowflake query per session to compute the requesting AM's personal attach rate for the 4 tracked products, against the same `ref_month` as the benchmark file. Returns personal rates + cohort benchmarks merged.

**Blast radius:** If Snowflake is unavailable or the AM email is not in `MONTHLY_ACCOUNT_OWNER` (e.g. demo accounts), the API returns benchmarks-only mode with null personal rates. The panel renders with "Your data syncs when your book loads" placeholders. No crash, no blank panel.

**Kill switch:** Set `ATTACH_INTEL_ENABLED=false` in Vercel env vars to remove the panel entirely without a deploy.

---

## Environment setup

All scripts require:
- Access to the `tables-pm-workspace` venv: `~/tables-pm-workspace/venv/bin/python3`
- Snowflake SSO via Okta: first run opens a browser tab. Subsequent runs reuse the token.
- `SNOWFLAKE_USER` resolves automatically from `git config user.email` - no hardcoded credentials.

**To run as a different user:** Set `SNOWFLAKE_USER=their.email@toasttab.com` before the command. The Okta SSO prompt will open for that user.

---

## Handoff notes for infer team

This pipeline is intentionally simple:
- Two scripts, one output file each
- No orchestration layer, no dbt models, no incremental state
- All queries are self-contained SQL in the script files
- The app reads static JSON at deploy time (benchmarks) or via a single live query (personal rates)

When you take this over, the natural next steps are:
1. Schedule `--monthly` via Airflow/dbt Cloud on the 3rd of each month (after Snowflake close)
2. Schedule `--weekly` per-rep via Airflow on Monday 8am
3. Replace the `execSync` Python call in `app/api/attach-intel/route.ts` with a Vercel KV cache (Redis) keyed on `email + ref_month`, TTL 24h - eliminates the live Snowflake query from the request path entirely
4. Consider moving `data/rep-accounts.json` to a database (Supabase or Vercel Postgres) so multiple reps can be updated independently without a full redeploy

Current Vercel project: `tables-am-assist` on team `toast-v0` (team_bXpXgaYNc1uUbFex5Yxy6od6)