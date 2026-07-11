#!/usr/bin/env python3
"""
Seed rep-accounts.json with live Snowflake data for a given rep email.

Usage (run from tables-pm-workspace/):
  python3 ../tables-rep-assist/scripts/seed_rep_accounts.py --rep tanguy.delannoy@toasttab.com

Requirements:
  - Run from tables-pm-workspace/ so snowflake_connector is on the path
  - SNOWFLAKE_USER env var or git config user.email must be set
  - venv must be active or use ./venv/bin/python3

Output:
  Prints a JSON block to paste into data/rep-accounts.json under the rep's email key.
  Also writes directly to the file if --write flag is passed.
"""

import sys, os, json, argparse
from pathlib import Path
from datetime import date

# Allow running from tables-pm-workspace or tables-rep-assist
PM_WORKSPACE = Path(__file__).parent.parent.parent / "tables-pm-workspace"
sys.path.insert(0, str(PM_WORKSPACE))

try:
    from snowflake_connector import quick_query
except ImportError:
    print("ERROR: Could not import snowflake_connector.")
    print("Run this script from tables-pm-workspace/ or ensure the path is correct.")
    sys.exit(1)

REP_ACCOUNTS_PATH = Path(__file__).parent.parent / "data" / "rep-accounts.json"

ACCOUNTS_SQL = """
WITH rep AS (
    SELECT EMPLOYEE_ROW_ID, EMPLOYEE_NAME, TEAM, REGION, EMAIL
    FROM TOAST.ANALYTICS_CORE.EMPLOYEE_DAILY_DIM
    WHERE EMAIL = '{email}'
      AND EMPLOYEE_DATE = (
          SELECT MAX(EMPLOYEE_DATE) FROM TOAST.ANALYTICS_CORE.EMPLOYEE_DAILY_DIM
          WHERE EMAIL = '{email}'
      )
    LIMIT 1
),
rep_accounts AS (
    SELECT DISTINCT
        c.CUSTOMER_NAME,
        c.CITY,
        c.STATE,
        c.ACCOUNT_TOAST_GUID,
        c.SALESFORCE_ACCOUNTID,
        opp.OPPORTUNITY_CLOSE_DATE AS signed_date
    FROM TOAST.GTM.OPPORTUNITY opp
    JOIN TOAST.ANALYTICS_CORE.CUSTOMER c ON opp.SALESFORCE_ACCOUNTID = c.SALESFORCE_ACCOUNTID
    JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_DAILY_DIM edd
        ON opp.OPPORTUNITY_OWNER_ID = edd.EMPLOYEE_ROW_ID
        AND opp.OPPORTUNITY_CLOSE_DATE = edd.EMPLOYEE_DATE
    WHERE edd.EMAIL = '{email}'
      AND opp.OPPORTUNITY_ISWON = TRUE
      AND opp.OPPORTUNITY_TYPE <> 'Renewal'
      AND EXISTS (
          SELECT 1 FROM TOAST.GTM.OPPORTUNITY_LINE_ITEM_FACT oli
          WHERE oli.SALESFORCE_OPPORTUNITYID = opp.SALESFORCE_OPPORTUNITYID
            AND oli.PRODUCT_SKU IN ('SUB038', 'SUB042')
            AND oli.ITEM_QUANTITY > 0
      )
),
booking_summary AS (
    SELECT
        b.TOASTORDERS_RESTAURANT_GUID,
        COUNT(*) AS bookings_90d,
        SUM(b.PARTY_SIZE) AS covers_90d,
        MAX(b.EXPECTED_START_TIME)::DATE AS last_booking_date
    FROM TOAST.PRODUCT.TOAST_TABLES_BOOKINGS b
    WHERE b.EXPECTED_START_TIME >= DATEADD('DAY', -90, CURRENT_DATE)
    GROUP BY 1
),
activation AS (
    SELECT SALESFORCE_ACCOUNTID, IS_ACTIVATED, ACTIVATION_DATE, SAAS_STATUS
    FROM TOAST.ANALYTICS_CORE_ARR.CURRENT_MODULE_ACTIVATION_ADOPTION
    WHERE MODULE_NAME ILIKE '%tables%'
)
SELECT
    a.CUSTOMER_NAME,
    a.CITY,
    a.STATE,
    a.ACCOUNT_TOAST_GUID,
    a.SIGNED_DATE,
    COALESCE(act.SAAS_STATUS, 'Unknown') AS activation_status,
    COALESCE(act.IS_ACTIVATED, FALSE) AS is_activated,
    act.ACTIVATION_DATE,
    COALESCE(bs.BOOKINGS_90D, 0) AS bookings_90d,
    COALESCE(bs.COVERS_90D, 0) AS covers_90d,
    bs.LAST_BOOKING_DATE,
    r.EMPLOYEE_NAME AS rep_name,
    r.TEAM,
    r.REGION
FROM rep_accounts a
LEFT JOIN booking_summary bs ON a.ACCOUNT_TOAST_GUID = bs.TOASTORDERS_RESTAURANT_GUID
LEFT JOIN activation act ON a.SALESFORCE_ACCOUNTID = act.SALESFORCE_ACCOUNTID
CROSS JOIN rep r
ORDER BY a.SIGNED_DATE DESC
"""

MONTHLY_TREND_SQL = """
SELECT
    DATE_TRUNC('MONTH', b.EXPECTED_START_TIME)::DATE AS month,
    COUNT(*) AS bookings,
    SUM(b.PARTY_SIZE) AS covers
FROM TOAST.PRODUCT.TOAST_TABLES_BOOKINGS b
WHERE b.TOASTORDERS_RESTAURANT_GUID = '{guid}'
  AND b.EXPECTED_START_TIME >= DATEADD('MONTH', -5, CURRENT_DATE)
GROUP BY 1
ORDER BY 1
"""

SIMILAR_SQL = """
SELECT
    c.CUSTOMER_NAME,
    c.CITY,
    c.STATE,
    COUNT(b.BOOKING_GUID) AS bookings_90d,
    SUM(b.PARTY_SIZE) AS covers_90d,
    MAX(b.EXPECTED_START_TIME)::DATE AS last_booking
FROM TOAST.ANALYTICS_CORE.CUSTOMER c
JOIN TOAST.PRODUCT.TOAST_TABLES_BOOKINGS b ON c.ACCOUNT_TOAST_GUID = b.TOASTORDERS_RESTAURANT_GUID
WHERE c.STATE IN ({states})
  AND b.EXPECTED_START_TIME >= DATEADD('DAY', -90, CURRENT_DATE)
GROUP BY 1, 2, 3
HAVING COUNT(b.BOOKING_GUID) > 20
ORDER BY bookings_90d DESC
LIMIT 5
"""

# Midwest states by region
REGION_STATES = {
    "default": "'IA', 'MN', 'WI', 'NE', 'MO', 'IL', 'IN', 'OH', 'MI'",
    "northeast": "'NY', 'MA', 'CT', 'NJ', 'PA', 'RI', 'NH', 'VT', 'ME'",
    "southeast": "'FL', 'GA', 'NC', 'SC', 'VA', 'TN', 'AL', 'MS', 'KY'",
    "southwest": "'TX', 'AZ', 'NM', 'OK', 'AR', 'LA'",
    "west": "'CA', 'WA', 'OR', 'CO', 'NV', 'UT'",
}


def seed_rep(email: str, write: bool = False):
    print(f"Fetching accounts for {email}...", file=sys.stderr)
    df = quick_query(ACCOUNTS_SQL.format(email=email))

    if df.empty:
        print(f"No won Tables accounts found for {email}", file=sys.stderr)
        return None

    rep_name = df.iloc[0]["REP_NAME"]
    team = df.iloc[0]["TEAM"]
    region = str(df.iloc[0]["REGION"] or "")
    print(f"Found {len(df)} account(s) for {rep_name}", file=sys.stderr)

    accounts = []
    for _, row in df.iterrows():
        guid = row["ACCOUNT_TOAST_GUID"]
        trend_df = quick_query(MONTHLY_TREND_SQL.format(guid=guid))
        trend = [
            {"month": str(r["MONTH"]), "bookings": int(r["BOOKINGS"]), "covers": int(r["COVERS"] or 0)}
            for _, r in trend_df.iterrows()
        ]
        accounts.append({
            "name": row["CUSTOMER_NAME"],
            "city": row["CITY"],
            "state": row["STATE"],
            "toast_guid": guid,
            "signed_date": str(row["SIGNED_DATE"]),
            "activation_status": row["ACTIVATION_STATUS"],
            "is_activated": bool(row["IS_ACTIVATED"]),
            "activation_date": str(row["ACTIVATION_DATE"]) if row["ACTIVATION_DATE"] else None,
            "bookings_90d": int(row["BOOKINGS_90D"]),
            "covers_90d": int(row["COVERS_90D"] or 0),
            "last_booking_date": str(row["LAST_BOOKING_DATE"]) if row["LAST_BOOKING_DATE"] else None,
            "monthly_trend": trend,
        })

    # Pick region states based on rep's region string
    region_lower = region.lower()
    if any(k in region_lower for k in ["south", "florida", "atlanta", "carolinas"]):
        states = REGION_STATES["southeast"]
    elif any(k in region_lower for k in ["texas", "dallas", "houston", "southwest"]):
        states = REGION_STATES["southwest"]
    elif any(k in region_lower for k in ["new york", "boston", "northeast", "philly"]):
        states = REGION_STATES["northeast"]
    elif any(k in region_lower for k in ["california", "seattle", "denver", "west"]):
        states = REGION_STATES["west"]
    else:
        states = REGION_STATES["default"]

    print(f"Finding similar accounts in region ({states[:40]}...)...", file=sys.stderr)
    similar_df = quick_query(SIMILAR_SQL.format(states=states))
    similar = [
        {
            "name": r["CUSTOMER_NAME"],
            "city": r["CITY"],
            "state": r["STATE"],
            "bookings_90d": int(r["BOOKINGS_90D"]),
            "covers_90d": int(r["COVERS_90D"] or 0),
            "last_booking": str(r["LAST_BOOKING"]),
        }
        for _, r in similar_df.iterrows()
    ]

    payload = {
        "rep_name": rep_name,
        "team": team,
        "region": region,
        "seeded_at": str(date.today()),
        "accounts": accounts,
        "similar_accounts": similar,
    }

    if write:
        data = json.loads(REP_ACCOUNTS_PATH.read_text())
        data[email] = payload
        REP_ACCOUNTS_PATH.write_text(json.dumps(data, indent=2))
        print(f"Written to {REP_ACCOUNTS_PATH}", file=sys.stderr)
    else:
        print(json.dumps({email: payload}, indent=2))

    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed rep account data from Snowflake")
    parser.add_argument("--rep", required=True, help="Rep Toast email address")
    parser.add_argument("--write", action="store_true", help="Write directly to data/rep-accounts.json")
    args = parser.parse_args()
    seed_rep(args.rep, write=args.write)
