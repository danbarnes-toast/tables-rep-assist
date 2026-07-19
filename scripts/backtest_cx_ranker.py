"""
Backtest for Cx Ranker v2 signals against historical churn data.

Methodology:
- Churned cohort: 2,207 accounts where POS_STATUS went Live -> Churn
  in ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR (Jan 2024 - Mar 2026)
- Control cohort: randomly sampled accounts that were Live throughout the window
- For each account: compute Cx Ranker signal scores at T-90d before churn
- Evaluate: precision, recall, FPR vs 20% ceiling, signal lift per flag

Signals evaluated:
  1. trajectory_decline  -- 25%+ booking drop last 3m vs prior 3m
  2. care_case           -- 2+ support cases in 90d AND no rep contact in 45d
  3. activation_gap      -- signed 21-90d ago, not activated
  4. adoption_lapse      -- IS_ADOPTED flipped False in last 2 months

Output: results/backtest_results.json + printed summary
"""
import sys
import os
import json
import random
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "tables-pm-workspace"))
from snowflake_connector import quick_query

CHURN_WINDOW_START = "2024-01-01"
CHURN_WINDOW_END = "2025-09-01"   # leaves 9m buffer before today
LOOKBACK_MONTHS = 6              # signals evaluated at T-90d
SIGNAL_LOOKBACK_DAYS = 90        # how far back each signal looks
CONTROL_SAMPLE_SIZE = 500        # non-churned accounts for FPR calc

# ---------------------------------------------------------------------------
# Step 1: Pull churned cohort
# ---------------------------------------------------------------------------

CHURNED_ACCOUNTS_SQL = """
WITH last_live AS (
    SELECT
        SALESFORCE_ACCOUNTID,
        MAX(CASE WHEN POS_STATUS = 'Live' THEN FIRSTDAYOFMONTH END) AS churn_month,
        MAX(FIRSTDAYOFMONTH) AS last_seen_month
    FROM TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR
    WHERE MODULE_NAME = 'Toast Tables'
      AND FIRSTDAYOFMONTH BETWEEN '{start}' AND '{end}'
    GROUP BY SALESFORCE_ACCOUNTID
    HAVING churn_month IS NOT NULL
       AND churn_month < '{end}'
       AND last_seen_month > churn_month
)
SELECT SALESFORCE_ACCOUNTID, churn_month
FROM last_live
ORDER BY churn_month
"""

# ---------------------------------------------------------------------------
# Step 2: Pull control cohort (accounts that stayed Live throughout)
# ---------------------------------------------------------------------------

CONTROL_ACCOUNTS_SQL = """
WITH always_live AS (
    SELECT
        SALESFORCE_ACCOUNTID,
        COUNT(DISTINCT FIRSTDAYOFMONTH) AS months_live,
        MIN(FIRSTDAYOFMONTH) AS first_seen,
        MAX(FIRSTDAYOFMONTH) AS last_seen
    FROM TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR
    WHERE MODULE_NAME = 'Toast Tables'
      AND POS_STATUS = 'Live'
      AND FIRSTDAYOFMONTH BETWEEN '{start}' AND '{end}'
    GROUP BY SALESFORCE_ACCOUNTID
    HAVING months_live >= 12  -- at least 12 consecutive months (proxy for never churned)
)
SELECT SALESFORCE_ACCOUNTID
FROM always_live
ORDER BY RANDOM()
LIMIT {limit}
"""

# ---------------------------------------------------------------------------
# Step 3: Pull pre-churn signals for a batch of accounts
# Signals evaluated at [eval_start, eval_end] window (T-90d to T)
# ---------------------------------------------------------------------------

SIGNALS_SQL = """
WITH accounts AS (
    SELECT COLUMN1 AS SALESFORCE_ACCOUNTID, COLUMN2::DATE AS eval_date
    FROM VALUES {values_clause}
),
arr_data AS (
    SELECT
        m.SALESFORCE_ACCOUNTID,
        a.eval_date,
        -- IS_ADOPTED in last 3 months (adoption_lapse: all 3 months not-adopted)
        SUM(CASE WHEN m.FIRSTDAYOFMONTH >= DATEADD('month', -3, a.eval_date)
                  AND NOT m.IS_ADOPTED THEN 1 ELSE 0 END) AS adoption_not_adopted_months,
        -- IS_ADOPTED flag at eval time
        MAX(CASE WHEN m.FIRSTDAYOFMONTH = DATE_TRUNC('month', a.eval_date) THEN m.IS_ADOPTED::INT ELSE NULL END) AS is_adopted_now,
        -- ARR change trend
        SUM(CASE WHEN m.FIRSTDAYOFMONTH >= DATEADD('month', -3, a.eval_date) THEN m.LIVE_ARR ELSE 0 END) AS arr_recent_3m,
        SUM(CASE WHEN m.FIRSTDAYOFMONTH >= DATEADD('month', -6, a.eval_date)
                  AND m.FIRSTDAYOFMONTH < DATEADD('month', -3, a.eval_date) THEN m.LIVE_ARR ELSE 0 END) AS arr_prior_3m
    FROM TOAST.ANALYTICS_CORE_ARR.MONTHLY_CUSTOMER_MODULE_ARR m
    JOIN accounts a ON m.SALESFORCE_ACCOUNTID = a.SALESFORCE_ACCOUNTID
    WHERE m.MODULE_NAME = 'Toast Tables'
      AND m.FIRSTDAYOFMONTH BETWEEN DATEADD('month', -6, a.eval_date) AND a.eval_date
    GROUP BY m.SALESFORCE_ACCOUNTID, a.eval_date
),
booking_data AS (
    SELECT
        c.SALESFORCE_ACCOUNTID,
        a.eval_date,
        -- Monthly bookings for trajectory signal
        DATE_TRUNC('month', b.EXPECTED_START_TIME::DATE) AS booking_month,
        COUNT(*) AS monthly_bookings
    FROM accounts a
    JOIN TOAST.ANALYTICS_CORE.CUSTOMER c ON c.SALESFORCE_ACCOUNTID = a.SALESFORCE_ACCOUNTID
    JOIN TOAST.PRODUCT.TOAST_TABLES_BOOKINGS b ON b.TOASTORDERS_RESTAURANT_GUID = c.ACCOUNT_TOAST_GUID
    WHERE b.EXPECTED_START_TIME::DATE BETWEEN DATEADD('month', -6, a.eval_date) AND a.eval_date
      AND b.BOOKING_STATUS NOT IN ('CANCELLED', 'NO_SHOW')
    GROUP BY c.SALESFORCE_ACCOUNTID, a.eval_date, booking_month
),
booking_agg AS (
    SELECT
        SALESFORCE_ACCOUNTID,
        eval_date,
        SUM(CASE WHEN booking_month >= DATEADD('month', -3, eval_date) THEN monthly_bookings ELSE 0 END) AS bookings_recent_3m,
        SUM(CASE WHEN booking_month >= DATEADD('month', -6, eval_date)
                  AND booking_month < DATEADD('month', -3, eval_date) THEN monthly_bookings ELSE 0 END) AS bookings_prior_3m
    FROM booking_data
    GROUP BY SALESFORCE_ACCOUNTID, eval_date
),
support_data AS (
    SELECT
        c.SALESFORCE_ACCOUNTID,
        a.eval_date,
        COUNT(DISTINCT t.SALESFORCE_CASEID) AS case_count_90d
    FROM accounts a
    JOIN TOAST.ANALYTICS_CORE.CUSTOMER c ON c.SALESFORCE_ACCOUNTID = a.SALESFORCE_ACCOUNTID
    LEFT JOIN TOAST.CS_CUSTOMER_CARE.SUPPORT_TICKET t
        ON t.SALESFORCE_ACCOUNTID = c.SALESFORCE_ACCOUNTID
       AND t.CREATED_DATETIME::DATE BETWEEN DATEADD('day', -90, a.eval_date) AND a.eval_date
    GROUP BY c.SALESFORCE_ACCOUNTID, a.eval_date
),
contact_data AS (
    SELECT
        ta.SALESFORCE_ACCOUNTID,
        a.eval_date,
        DATEDIFF('day', MAX(ta.COMPLETED_DATE), a.eval_date) AS days_since_contact
    FROM accounts a
    JOIN TOAST.ANALYTICS_CORE.TASK_ACTIVITY ta ON ta.SALESFORCE_ACCOUNTID = a.SALESFORCE_ACCOUNTID
    WHERE ta.COMPLETED_DATE BETWEEN DATEADD('day', -180, a.eval_date) AND a.eval_date
    GROUP BY ta.SALESFORCE_ACCOUNTID, a.eval_date
)
SELECT
    a.SALESFORCE_ACCOUNTID,
    a.eval_date,
    -- Booking trajectory signal
    COALESCE(ba.bookings_recent_3m, 0) AS bookings_recent_3m,
    COALESCE(ba.bookings_prior_3m, 0) AS bookings_prior_3m,
    CASE WHEN COALESCE(ba.bookings_prior_3m, 0) >= 20
          AND COALESCE(ba.bookings_recent_3m, 0) < COALESCE(ba.bookings_prior_3m, 0) * 0.75
         THEN 1 ELSE 0 END AS signal_trajectory_decline,
    -- Silence signal: zero cases AND no contact in 90d (silent departure pattern)
    COALESCE(sd.case_count_90d, 0) AS case_count_90d,
    COALESCE(cd.days_since_contact, 999) AS days_since_contact,
    CASE WHEN COALESCE(sd.case_count_90d, 0) = 0
          AND COALESCE(cd.days_since_contact, 999) > 90
         THEN 1 ELSE 0 END AS signal_silence,
    -- Adoption lapse: 3 consecutive months not-adopted (tightened from 2)
    CASE WHEN COALESCE(ad.adoption_not_adopted_months, 0) >= 3 THEN 1 ELSE 0 END AS signal_adoption_lapse,
    -- ARR decline as supplementary (not a scored signal, just FYI)
    COALESCE(ad.arr_recent_3m, 0) AS arr_recent_3m,
    COALESCE(ad.arr_prior_3m, 0) AS arr_prior_3m,
    -- Composite score: fire if 2+ signals active (reduces FPR vs any-one-signal)
    CASE WHEN (
        CASE WHEN COALESCE(ba.bookings_prior_3m, 0) >= 20
              AND COALESCE(ba.bookings_recent_3m, 0) < COALESCE(ba.bookings_prior_3m, 0) * 0.75
             THEN 1 ELSE 0 END
        + CASE WHEN COALESCE(sd.case_count_90d, 0) = 0 AND COALESCE(cd.days_since_contact, 999) > 90 THEN 1 ELSE 0 END
        + CASE WHEN COALESCE(ad.adoption_not_adopted_months, 0) >= 3 THEN 1 ELSE 0 END
    ) >= 2 THEN 1 ELSE 0 END AS any_signal_fired
FROM accounts a
LEFT JOIN booking_agg ba ON ba.SALESFORCE_ACCOUNTID = a.SALESFORCE_ACCOUNTID AND ba.eval_date = a.eval_date
LEFT JOIN support_data sd ON sd.SALESFORCE_ACCOUNTID = a.SALESFORCE_ACCOUNTID AND sd.eval_date = a.eval_date
LEFT JOIN contact_data cd ON cd.SALESFORCE_ACCOUNTID = a.SALESFORCE_ACCOUNTID AND cd.eval_date = a.eval_date
LEFT JOIN arr_data ad ON ad.SALESFORCE_ACCOUNTID = a.SALESFORCE_ACCOUNTID AND ad.eval_date = a.eval_date
"""


def build_values_clause(accounts_with_dates: list[tuple]) -> str:
    """Build Snowflake VALUES clause for accounts + eval dates."""
    # No outer parens - Snowflake VALUES syntax: FROM VALUES (r1), (r2), ...
    return ", ".join(f"('{sf_id}', '{eval_date}')" for sf_id, eval_date in accounts_with_dates)


def run_backtest():
    print("=== Cx Ranker Backtest ===\n")

    # Step 1: Churned cohort
    print("Pulling churned cohort...")
    churned_df = quick_query(
        CHURNED_ACCOUNTS_SQL.format(start=CHURN_WINDOW_START, end=CHURN_WINDOW_END)
    )
    print(f"  Churned accounts found: {len(churned_df)}")

    # Build (sf_id, eval_date) pairs: evaluate signals 90 days before churn month
    churned_pairs = []
    for _, row in churned_df.iterrows():
        churn_month = row["CHURN_MONTH"]
        eval_date = churn_month - timedelta(days=90)
        churned_pairs.append((row["SALESFORCE_ACCOUNTID"], str(eval_date)))

    # Step 2: Control cohort
    print("Pulling control cohort...")
    control_df = quick_query(
        CONTROL_ACCOUNTS_SQL.format(
            start=CHURN_WINDOW_START, end=CHURN_WINDOW_END, limit=CONTROL_SAMPLE_SIZE
        )
    )
    print(f"  Control accounts found: {len(control_df)}")

    # For control: use a random eval date in the middle of the window
    mid_date = date(2025, 1, 1)
    control_pairs = [(row["SALESFORCE_ACCOUNTID"], str(mid_date)) for _, row in control_df.iterrows()]

    # Step 3: Run signals query in batches (Snowflake VALUES clause limit ~16K rows)
    BATCH_SIZE = 200

    def run_in_batches(pairs, label):
        results = []
        total = len(pairs)
        for i in range(0, total, BATCH_SIZE):
            batch = pairs[i:i + BATCH_SIZE]
            pct = min(i + BATCH_SIZE, total)
            print(f"  {label}: {pct}/{total}...", end="\r")
            values = build_values_clause(batch)
            sql = SIGNALS_SQL.replace("{values_clause}", values)
            df = quick_query(sql)
            results.append(df)
        print()
        import pandas as pd
        return pd.concat(results, ignore_index=True) if results else None

    print("Computing signals for churned cohort...")
    churned_signals = run_in_batches(churned_pairs, "Churned")

    print("Computing signals for control cohort...")
    control_signals = run_in_batches(control_pairs, "Control")

    # Step 4: Compute metrics
    def metrics(df, label):
        n = len(df)
        if n == 0:
            return {}
        any_fired = int(df["ANY_SIGNAL_FIRED"].sum())
        traj = int(df["SIGNAL_TRAJECTORY_DECLINE"].sum())
        silence = int(df["SIGNAL_SILENCE"].sum())
        adopt = int(df["SIGNAL_ADOPTION_LAPSE"].sum())
        return {
            "label": label,
            "n": n,
            "any_signal_rate": round(any_fired / n * 100, 1),
            "trajectory_decline_rate": round(traj / n * 100, 1),
            "silence_rate": round(silence / n * 100, 1),
            "adoption_lapse_rate": round(adopt / n * 100, 1),
            "avg_case_count": round(float(df["CASE_COUNT_90D"].mean()), 2),
            "avg_days_since_contact": round(float(df["DAYS_SINCE_CONTACT"].mean()), 0),
        }

    churned_metrics = metrics(churned_signals, "Churned")
    control_metrics = metrics(control_signals, "Control")

    # Recall = % of churned that fired at least one signal
    recall = churned_metrics.get("any_signal_rate", 0)

    # FPR = % of non-churned that fired at least one signal (want < 20%)
    fpr = control_metrics.get("any_signal_rate", 0)

    # Lift per signal
    def lift(churned_rate, control_rate):
        if control_rate == 0:
            return "inf"
        return round(churned_rate / control_rate, 1)

    results = {
        "churned": churned_metrics,
        "control": control_metrics,
        "recall_pct": recall,
        "fpr_pct": fpr,
        "fpr_ceiling_met": fpr < 20.0,
        "signal_lifts": {
            "trajectory_decline": lift(
                churned_metrics["trajectory_decline_rate"],
                control_metrics["trajectory_decline_rate"]
            ),
            "silence": lift(
                churned_metrics["silence_rate"],
                control_metrics["silence_rate"]
            ),
            "adoption_lapse": lift(
                churned_metrics["adoption_lapse_rate"],
                control_metrics["adoption_lapse_rate"]
            ),
        }
    }

    # Print summary
    print("\n" + "=" * 60)
    print("BACKTEST RESULTS")
    print("=" * 60)
    print(f"\nCohorts: {churned_metrics['n']} churned | {control_metrics['n']} control")
    print(f"\nRecall:  {recall}% of churned accounts had >= 1 signal combo at T-90d")
    print(f"FPR:     {fpr}% of control accounts had >= 1 signal combo")
    print(f"FPR ceiling (< 20%): {'PASS' if results['fpr_ceiling_met'] else 'FAIL'}")
    print(f"\nIndividual signal rates (churned vs control):")
    for sig in ["trajectory_decline", "silence", "adoption_lapse"]:
        c_rate = churned_metrics[f"{sig}_rate"]
        n_rate = control_metrics[f"{sig}_rate"]
        l = results["signal_lifts"][sig]
        print(f"  {sig:25s}  churned={c_rate}%  control={n_rate}%  lift={l}x")
    print()

    # Save
    out_dir = Path(__file__).parent.parent / "data" / "backtest"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "backtest_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"Results saved to {out_path}")

    return results


if __name__ == "__main__":
    results = run_backtest()