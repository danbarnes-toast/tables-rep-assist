# AM Assist: Data Enrichment v2

## Why this matters

AMs on the Tables pod are missing churn-risk accounts every week because key signals are fabricated.
Real data: 49/79 of Alexis's accounts have cases in the last 90 days (141 open cases).
58/79 accounts have Salesforce-logged touches in TASK_ACTIVITY.
At avg $2-4K Tables ARR per account, the at-risk portion of Alexis's book represents $60-100K
that could cancel without proactive outreach.

MTAU chain: fewer churned Tables accounts = more live locations = higher MTAU floor toward 2.5M.

## What's real vs fabricated today

| Field | Status | Source |
|---|---|---|
| Bookings, covers, monthly trend | Real | TOAST_TABLES_BOOKINGS |
| Product activation / adoption | Real (module_data) | CURRENT_MODULE_ACTIVATION_ADOPTION |
| Chorus calls, days_since_touchpoint | Real Chorus dates | CHORUS_AI_ENGAGEMENTS |
| total_arr | Real where vol_30d > 0 | module vol_30d * 12 |
| account_grade | Missing | ANALYTICS_CORE.ACCOUNT |
| open_support_tickets | Fabricated | seeded from health label |
| case details | Missing | CS_CUSTOMER_CARE.SUPPORT_TICKET |
| days_since_rep_contact | Missing | TASK_ACTIVITY |
| flare_signals | Missing | computable from existing data |
| contract/promo data | Not in this book | zero promo codes in GTM.OPPORTUNITY |

## Probe results (Jul 15 2026)

- TASK_ACTIVITY: 58/79 accounts matched (73%). Nulls fall back to Chorus.
- SUPPORT_TICKET: 49/79 accounts have cases in 90d. 141 open cases total.
- IS_ESCALATED: in ALL_CASES, not SUPPORT_TICKET. Join on SALESFORCE_CASEID.
- Promo codes: zero rows in this book. Phase 4 (contract/promo) skipped.
- Account grade: in ANALYTICS_CORE.ACCOUNT, one column addition.

## Phase 0: Account grade (one-liner, proves pipeline)

Add to ACCOUNTS_SQL in seed_rep_accounts.py (c.ACCOUNT_GRADE, c.ACCOUNT_PROFITABILITY_BUCKET).
ANALYTICS_CORE.CUSTOMER already aliased as c. No new join needed.

## Phase 1: Real support cases (batch query)

Source: TOAST.CS_CUSTOMER_CARE.SUPPORT_TICKET + ALL_CASES for IS_ESCALATED.
Single batch IN-clause query for all 79 accounts. Not per-account loops.
Fields: case_count_90d, open_cases, escalated_cases, days_since_last_case, top_case_category, case_subjects.

## Phase 2: Rep contact from TASK_ACTIVITY (batch query)

Source: TOAST.ANALYTICS_CORE.TASK_ACTIVITY.
73% match rate. Unmatched fall back to days_since_touchpoint (Chorus).
Fields: days_since_rep_contact, last_contact_date.

## Phase 3: Flare signals

compute_flare_signals() in enrich_product_health.py.
All signals computable from existing data. No new Snowflake queries.
- trajectory_decline: 25%+ booking drop last 3m vs prior 3m (min 20 bookings/m baseline)
- care_case: 2+ cases in 90d AND no contact in 45d
- activation_gap: signed 21-90d ago, not yet activated

## Phase 5: Cx Ranker v2 + UI

Updated scoring uses real case data and flare signals.
UI: case category sub-label, escalated badge, flare signal badges, account grade badge.

## Phase 6: system-prompt.ts

Add case data, rep contact, flare signals to account block.

## Outcome metrics

1. Accounts with real case signals in Cx Ranker top 5 (expect more than half)
2. Distribution: cancel_risk ~25%, at_risk ~48%, healthy ~27%
3. Escalated case count non-zero for 10%+ of book

## Files to modify

| File | Change |
|---|---|
| scripts/seed_rep_accounts.py | Phase 0/1/2: grade cols, SUPPORT_CASES_BATCH_SQL, TASK_ACTIVITY_BATCH_SQL |
| scripts/enrich_product_health.py | Phase 3: compute_flare_signals() |
| app/page.tsx | Phase 5: Account type, Cx Ranker v2, UI badges |
| lib/system-prompt.ts | Phase 6: case data, rep contact, flare context |
| public/rep-accounts.json | Regenerated |
