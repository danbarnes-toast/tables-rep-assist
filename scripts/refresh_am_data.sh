#!/bin/bash
# Refresh AM data from Snowflake and re-enrich product health.
#
# Two modes:
#   --weekly   Refresh live signals (Chorus, bookings, activation) for one rep.
#              Run Monday morning. Takes ~2 min per rep.
#   --monthly  Recompute cohort benchmarks (median + p90 per product).
#              Run once after Snowflake monthly close (3rd of the month).
#              Takes ~30s. Does not require a rep email argument.
#
# Usage:
#   bash scripts/refresh_am_data.sh --weekly alexis.coutts@toasttab.com
#   bash scripts/refresh_am_data.sh --monthly
#   bash scripts/refresh_am_data.sh --all alexis.coutts@toasttab.com  (both steps)

set -e

MODE="${1}"
REP_EMAIL="${2}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
PM_DIR="$(dirname "$APP_DIR")/tables-pm-workspace"

# Run from tables-pm-workspace so snowflake_connector is importable
cd "$PM_DIR"

run_weekly() {
  if [ -z "$REP_EMAIL" ]; then
    echo "Error: --weekly requires a rep email argument."
    echo "Usage: $0 --weekly alexis.coutts@toasttab.com"
    exit 1
  fi

  echo "=== Weekly refresh: live signals for $REP_EMAIL ==="
  SNOWFLAKE_USER="$(git config user.email)" ./venv/bin/python3 "$SCRIPT_DIR/seed_rep_accounts.py" \
    --rep "$REP_EMAIL" --refresh

  echo ""
  echo "=== Re-enrich product health ==="
  ./venv/bin/python3 "$SCRIPT_DIR/enrich_product_health.py" --force

  echo ""
  echo "=== Distribution check ==="
  ./venv/bin/python3 -c "
import json
d = json.load(open('$APP_DIR/data/rep-accounts.json'))
accts = [a for k, rep in d.items() if k != '_meta' and isinstance(rep, dict) for a in rep.get('accounts', [])]
dist = {h: sum(1 for a in accts if a.get('account_health') == h) for h in ['healthy', 'at_risk', 'cancel_risk']}
total = sum(dist.values())
print(f'Total accounts: {total}')
for h, n in dist.items():
    print(f'  {h}: {n} ({round(100*n/total)}%)')
cold = sum(1 for a in accts if (a.get('days_since_touchpoint') or 999) > 180)
no_call = sum(1 for a in accts if (a.get('days_since_touchpoint') or 0) >= 999)
print(f'  No Chorus call on record in 180+ days: {cold}')
print(f'  No call on record at all: {no_call}')
"
}

run_monthly() {
  echo "=== Monthly refresh: cohort benchmarks ==="
  SNOWFLAKE_USER="$(git config user.email)" ./venv/bin/python3 "$SCRIPT_DIR/compute_cohort_benchmarks.py"
  echo ""
  echo "Benchmark file updated: $APP_DIR/data/cohort_benchmarks.json"
  echo "Commit and redeploy to push updated benchmarks to production."
}

case "$MODE" in
  --weekly)
    run_weekly
    ;;
  --monthly)
    run_monthly
    ;;
  --all)
    run_monthly
    echo ""
    run_weekly
    ;;
  *)
    echo "Usage:"
    echo "  $0 --weekly <rep-email>   Refresh live signals for one rep (run weekly)"
    echo "  $0 --monthly              Recompute cohort benchmarks (run monthly, 3rd of month)"
    echo "  $0 --all <rep-email>      Both steps"
    exit 1
    ;;
esac

echo ""
echo "Deploy: cd $APP_DIR && npx vercel deploy --prod --scope team_bXpXgaYNc1uUbFex5Yxy6od6"