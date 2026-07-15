#!/bin/bash
# Refresh AM data from Snowflake and re-enrich product health.
# Run weekly (Monday morning) to keep rep books current.
#
# Usage (from tables-pm-workspace/):
#   bash ../tables-am-assist/scripts/refresh_am_data.sh alexis.coutts@toasttab.com
#   bash ../tables-am-assist/scripts/refresh_am_data.sh tanguy.delannoy@toasttab.com

set -e

REP_EMAIL="${1}"
if [ -z "$REP_EMAIL" ]; then
  echo "Usage: $0 <rep-email>"
  echo "Example: $0 alexis.coutts@toasttab.com"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
PM_DIR="$(dirname "$APP_DIR")/tables-pm-workspace"

# Run from tables-pm-workspace so snowflake_connector is importable
cd "$PM_DIR"

echo "=== Step 1: Refresh live signals (Chorus, bookings, activation) ==="
SNOWFLAKE_USER="$(git config user.email)" ./venv/bin/python3 "$SCRIPT_DIR/seed_rep_accounts.py" \
  --rep "$REP_EMAIL" --refresh

echo ""
echo "=== Step 2: Re-enrich product health ==="
./venv/bin/python3 "$SCRIPT_DIR/enrich_product_health.py" --force

echo ""
echo "=== Distribution check ==="
./venv/bin/python3 -c "
import json
d = json.load(open('$APP_DIR/public/rep-accounts.json'))
accts = [a for k, rep in d.items() if k != '_meta' and isinstance(rep, dict) for a in rep.get('accounts', [])]
dist = {h: sum(1 for a in accts if a.get('account_health') == h) for h in ['healthy', 'at_risk', 'cancel_risk']}
total = sum(dist.values())
print(f'Total accounts: {total}')
for h, n in dist.items():
    print(f'  {h}: {n} ({round(100*n/total)}%)')
cold = sum(1 for a in accts if (a.get('days_since_touchpoint') or 999) > 180)
no_call = sum(1 for a in accts if (a.get('days_since_touchpoint') or 0) >= 999)
print(f'  No Chorus call in 180+ days: {cold}')
print(f'  No call on record at all: {no_call}')
"

echo ""
echo "Done. Deploy with: cd $APP_DIR && npx vercel deploy --prod"