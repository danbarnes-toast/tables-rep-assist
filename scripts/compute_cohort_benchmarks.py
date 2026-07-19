"""
Compute attach rate cohort benchmarks for the Attach Intel Panel.

Pulls Jun 2026 attach rates for all AMs with 10+ live Tables accounts,
then computes median and top-decile per product.

Output: data/cohort_benchmarks.json

Run monthly after the new month's MONTHLY_CUSTOMER_MODULE_ARR data lands.
Usage:
  SNOWFLAKE_USER="$(git config user.email)" ./venv/bin/python3 scripts/compute_cohort_benchmarks.py
"""
import sys
import json
from pathlib import Path
from datetime import date

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "tables-pm-workspace"))
from snowflake_connector import quick_query

_today = date.today()
_last = date(_today.year if _today.month > 1 else _today.year - 1,
             _today.month - 1 if _today.month > 1 else 12, 1)
REF_MONTH = _last.strftime("%Y-%m-%d")
MIN_ACCOUNTS = 10

SQL = """
WITH am_base AS (
    SELECT
        e.EMAIL_ADDRESS,
        ao.SALESFORCE_ACCOUNTID
    FROM TOAST.ANALYTICS_CORE.MONTHLY_ACCOUNT_OWNER ao
    JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT e
        ON e.SALESFORCE_USERID = ao.SALESFORCE_ACCOUNTOWNERID
    WHERE ao.FIRSTDAYOFMONTH = '{ref_month}'
      AND e.IS_ACTIVE = TRUE
),
am_tables AS (
    SELECT
        ab.EMAIL_ADDRESS,
        COUNT(DISTINCT ab.SALESFORCE_ACCOUNTID) AS total_tables_accts
    FROM am_base ab
    JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m
        ON m.SALESFORCE_ACCOUNTID = ab.SALESFORCE_ACCOUNTID
        AND m.MODULE_NAME = 'Toast Tables'
        AND m.POS_STATUS = 'Live'
        AND m.FIRSTDAYOFMONTH = '{ref_month}'
        AND m.IS_INTERNATIONAL_CUSTOMER = FALSE
        AND m.CUSTOMER_MARKET_SEGMENT IN ('SMB', 'Mid-Market')
    GROUP BY ab.EMAIL_ADDRESS
    HAVING total_tables_accts >= {min_accounts}
),
attach_rates AS (
    SELECT
        at.EMAIL_ADDRESS,
        at.total_tables_accts,
        COUNT(DISTINCT CASE WHEN m_oo.MODULE_NAME = 'Online Ordering' AND m_oo.POS_STATUS = 'Live'
                            THEN ab.SALESFORCE_ACCOUNTID END)
            * 100.0 / at.total_tables_accts AS oo_pct,
        COUNT(DISTINCT CASE WHEN m_xc.MODULE_NAME LIKE '%xtraChef%' AND m_xc.POS_STATUS = 'Live'
                            THEN ab.SALESFORCE_ACCOUNTID END)
            * 100.0 / at.total_tables_accts AS xc_pct,
        COUNT(DISTINCT CASE WHEN m_mkt.MODULE_NAME IN ('Marketing', 'SMS Marketing') AND m_mkt.POS_STATUS = 'Live'
                            THEN ab.SALESFORCE_ACCOUNTID END)
            * 100.0 / at.total_tables_accts AS mkt_pct,
        COUNT(DISTINCT CASE WHEN m_loy.MODULE_NAME = 'Loyalty' AND m_loy.POS_STATUS = 'Live'
                            THEN ab.SALESFORCE_ACCOUNTID END)
            * 100.0 / at.total_tables_accts AS loyalty_pct
    FROM am_tables at
    JOIN am_base ab ON ab.EMAIL_ADDRESS = at.EMAIL_ADDRESS
    JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m_tables
        ON m_tables.SALESFORCE_ACCOUNTID = ab.SALESFORCE_ACCOUNTID
        AND m_tables.MODULE_NAME = 'Toast Tables'
        AND m_tables.POS_STATUS = 'Live'
        AND m_tables.FIRSTDAYOFMONTH = '{ref_month}'
    LEFT JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m_oo
        ON m_oo.SALESFORCE_ACCOUNTID = ab.SALESFORCE_ACCOUNTID
        AND m_oo.MODULE_NAME = 'Online Ordering'
        AND m_oo.FIRSTDAYOFMONTH = '{ref_month}'
    LEFT JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m_xc
        ON m_xc.SALESFORCE_ACCOUNTID = ab.SALESFORCE_ACCOUNTID
        AND m_xc.MODULE_NAME LIKE '%xtraChef%'
        AND m_xc.FIRSTDAYOFMONTH = '{ref_month}'
    LEFT JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m_mkt
        ON m_mkt.SALESFORCE_ACCOUNTID = ab.SALESFORCE_ACCOUNTID
        AND m_mkt.MODULE_NAME IN ('Marketing', 'SMS Marketing')
        AND m_mkt.FIRSTDAYOFMONTH = '{ref_month}'
    LEFT JOIN TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m_loy
        ON m_loy.SALESFORCE_ACCOUNTID = ab.SALESFORCE_ACCOUNTID
        AND m_loy.MODULE_NAME = 'Loyalty'
        AND m_loy.FIRSTDAYOFMONTH = '{ref_month}'
    GROUP BY at.EMAIL_ADDRESS, at.total_tables_accts
)
SELECT
    MEDIAN(oo_pct)           AS oo_median,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY oo_pct)  AS oo_p90,
    MEDIAN(xc_pct)           AS xc_median,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY xc_pct)  AS xc_p90,
    MEDIAN(mkt_pct)          AS mkt_median,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY mkt_pct) AS mkt_p90,
    MEDIAN(loyalty_pct)      AS loyalty_median,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY loyalty_pct) AS loyalty_p90,
    COUNT(*) AS am_count
FROM attach_rates
""".format(ref_month=REF_MONTH, min_accounts=MIN_ACCOUNTS)


def main():
    print(f"Computing cohort benchmarks for {REF_MONTH} (min {MIN_ACCOUNTS} accounts)...")
    df = quick_query(SQL)
    row = df.iloc[0]

    benchmarks = {
        "ref_month": REF_MONTH,
        "generated_at": str(date.today()),
        "am_count": int(row["AM_COUNT"]),
        "products": [
            {
                "key": "oo",
                "name": "Online Ordering",
                "medianPct": round(float(row["OO_MEDIAN"]), 1),
                "topDecilePct": round(float(row["OO_P90"]), 1),
            },
            {
                "key": "xc",
                "name": "xtraCHEF",
                "medianPct": round(float(row["XC_MEDIAN"]), 1),
                "topDecilePct": round(float(row["XC_P90"]), 1),
            },
            {
                "key": "mkt",
                "name": "Toast Marketing",
                "medianPct": round(float(row["MKT_MEDIAN"]), 1),
                "topDecilePct": round(float(row["MKT_P90"]), 1),
            },
            {
                "key": "loyalty",
                "name": "Loyalty",
                "medianPct": round(float(row["LOYALTY_MEDIAN"]), 1),
                "topDecilePct": round(float(row["LOYALTY_P90"]), 1),
            },
        ],
    }

    out = Path(__file__).parent.parent / "data" / "cohort_benchmarks.json"
    with open(out, "w") as f:
        json.dump(benchmarks, f, indent=2)

    print(f"Written to {out}")
    print(f"AM cohort: {benchmarks['am_count']} AMs")
    for p in benchmarks["products"]:
        print(f"  {p['name']:20s}  median={p['medianPct']}%  p90={p['topDecilePct']}%")


if __name__ == "__main__":
    main()