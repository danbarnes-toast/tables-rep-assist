"""
Enrich rep-accounts.json with realistic multi-product health data.

For each account, assigns:
- products: list of ProductHealth objects across the Toast product suite
- days_since_touchpoint: derived from last chorus call date or randomized
- open_support_tickets: 0-3 based on account health signals
- total_arr: estimated ARR based on products purchased
- account_health: healthy / at_risk / cancel_risk

Run: python3 scripts/enrich_product_health.py
Writes output to data/rep-accounts.json in place.
"""

import json
import random
import os
import sys
from datetime import datetime, timedelta

PRODUCTS = [
    "Toast Tables",
    "xtraCHEF",
    "Toast Payroll",
    "Employee Cloud",
    "Toast Marketing",
    "Toast Capital",
    "Websites + Online Ordering",
    "Order & Pay",
    "Catering & Events",
    "Toast Pay / STP",
]

# Maps Snowflake MODULE_NAME strings to our 10-product labels.
# Confirmed from probe query against real accounts (Jul 15 2026).
MODULE_TO_PRODUCT = {
    "Toast Tables": "Toast Tables",
    "Online Ordering": "Websites + Online Ordering",
    "Websites": "Websites + Online Ordering",
    "Toast Digital Storefront Pro": "Websites + Online Ordering",
    "Toast Digital Storefront Essentials": "Websites + Online Ordering",
    "Marketing": "Toast Marketing",
    "SMS Marketing": "Toast Marketing",
    "Toast Marketing Essentials Suite with SMS": "Toast Marketing",
    "Loyalty": "Toast Marketing",          # loyalty = part of marketing motion for AMs
    "Toast Order & Pay": "Order & Pay",
    "Scan to Pay": "Toast Pay / STP",
    "Catering & Events": "Catering & Events",
    "Toast Catering and Events Management Pro": "Catering & Events",
    "Scheduling": "Employee Cloud",
    "Tips Manager": "Employee Cloud",
    # xtraCHEF: matched via substring in build logic below (MODULE_NAME LIKE '%xtraChef%')
    # Toast Payroll: no Snowflake row - RNG fallback
    # Toast Capital: no Snowflake row - RNG fallback
}

PRODUCT_ARR = {
    "Toast Tables": 2400,
    "xtraCHEF": 1800,
    "Toast Payroll": 3000,
    "Employee Cloud": 600,
    "Toast Marketing": 1800,
    "Toast Capital": 0,
    "Websites + Online Ordering": 1200,
    "Order & Pay": 1200,
    "Catering & Events": 1800,
    "Toast Pay / STP": 600,
}

REF_DATE = datetime(2026, 7, 15)


def days_since(date_str: str) -> int:
    try:
        d = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return (REF_DATE - d).days
    except Exception:
        return 999


def infer_products_from_calls(calls: list) -> set:
    """Extract product signals from Chorus call summaries."""
    found = set()
    text = " ".join(
        (c.get("summary", "") + " " + c.get("action_items", "")).lower()
        for c in calls
    )
    keywords = {
        "Toast Tables": ["tables", "reservation", "reservations", "waitlist", "floor plan", "rwg", "host app"],
        "xtraCHEF": ["xtrachef", "extra chef", "invoice", "food cost", "cogs", "recipe costing"],
        "Toast Payroll": ["payroll", "tip pool", "tip manager", "tipping", "scheduling", "sling", "time and attendance", "w-2"],
        "Employee Cloud": ["employee cloud", "onboarding", "i-9", "benefits", "digital onboarding"],
        "Toast Marketing": ["marketing", "loyalty", "email campaign", "sms", "guest feedback", "smart segment"],
        "Toast Capital": ["capital", "advance", "working capital", "lump sum"],
        "Websites + Online Ordering": ["online ordering", "website", "oo", "order online"],
        "Order & Pay": ["order and pay", "order & pay", "qr code", "qr-based"],
        "Catering & Events": ["catering", "events", "beo", "catering pro"],
        "Toast Pay / STP": ["stp", "smart tips", "tip prompt", "contactless"],
    }
    for product, kws in keywords.items():
        if any(kw in text for kw in kws):
            found.add(product)
    return found


def status_from_module_rows(rows: list, product: str) -> tuple:
    """Derive (status, notes) from real Snowflake module activation rows."""
    if not rows:
        return None, None

    # Merge txn_30d across rows for this product (e.g. Marketing + SMS Marketing)
    txn_30d = sum(r.get("txn_30d", 0) for r in rows)
    # Use the row with highest activity as the primary signal
    primary = max(rows, key=lambda r: r.get("txn_30d", 0))
    saas_status = primary.get("saas_status", "")
    is_activated = primary.get("is_activated", False)
    is_adopted = primary.get("is_adopted", False)

    if saas_status == "Backlog" or not is_activated:
        return "purchased_not_activated", "signed but not yet live"

    if not is_adopted:
        if product == "Toast Marketing":
            return "live_stalled", "activated but no sustained campaign activity"
        if product == "Websites + Online Ordering":
            return "live_stalled", "live but no sustained OO usage"
        return "live_stalled", "activated but usage not sustained"

    # Product-specific at-risk thresholds using txn_30d
    if product == "Websites + Online Ordering" and txn_30d == 0:
        return "live_at_risk", "no OO orders in 30 days"
    if product == "Toast Marketing" and txn_30d == 0:
        return "live_at_risk", "no campaign or loyalty activity in 30 days"
    if product == "xtraCHEF" and txn_30d == 0:
        return "live_at_risk", "no xtraCHEF activity in 30 days"
    if product == "Catering & Events" and txn_30d == 0:
        return "live_stalled", "no events logged in 30 days"
    if product == "Order & Pay" and txn_30d == 0:
        return "live_stalled", "Scan to Pay active but no transactions in 30 days"

    return "live_healthy", None


def build_product_health(acct: dict, seed: int) -> list:
    rng = random.Random(seed)
    calls = acct.get("chorus_calls", [])
    bookings_90d = acct.get("bookings_90d", 0)
    is_activated = acct.get("is_activated", False)
    signed_str = acct.get("signed_date", "2025-01-01")
    days_old = days_since(signed_str)

    # Real module data from Snowflake (seeded by seed_rep_accounts.py)
    raw_modules = acct.get("module_data", {})

    # Build lookup: product label -> list of matching module rows
    product_to_rows: dict = {p: [] for p in PRODUCTS}
    for mod_name, mod_row in raw_modules.items():
        # Direct map
        mapped = MODULE_TO_PRODUCT.get(mod_name)
        if mapped:
            product_to_rows[mapped].append(mod_row)
            continue
        # xtraCHEF: substring match
        if "xtrachef" in mod_name.lower():
            product_to_rows["xtraCHEF"].append(mod_row)

    # Products that have real Snowflake rows are "purchased" by definition
    purchased = {"Toast Tables"}
    for product, rows in product_to_rows.items():
        if rows:
            purchased.add(product)

    # Add products mentioned in calls (may catch things not in module table)
    purchased |= infer_products_from_calls(calls)

    # Deterministically add 1-4 more RNG-only products based on account age
    # (only for products with no real Snowflake signal)
    optional = [p for p in PRODUCTS if p not in purchased]
    rng.shuffle(optional)
    n_extra = 0
    if days_old > 365:
        n_extra = rng.randint(1, 2)
    elif days_old > 180:
        n_extra = rng.randint(0, 1)
    purchased |= set(optional[:n_extra])

    result = []

    for product in PRODUCTS:
        if product not in purchased:
            result.append({
                "product": product,
                "status": "not_purchased",
            })
            continue

        # Determine health status
        real_rows = product_to_rows.get(product, [])

        if product == "Toast Tables":
            if not is_activated:
                status = "purchased_not_activated"
                notes = "signed but not yet live"
            elif bookings_90d == 0:
                status = "live_at_risk"
                notes = "zero bookings in 90 days"
            elif bookings_90d < 30:
                status = "live_stalled"
                notes = f"{bookings_90d} bookings/90d, below baseline"
            else:
                status = "live_healthy"
                notes = None
        elif real_rows:
            # Real Snowflake data available - use it
            status, notes = status_from_module_rows(real_rows, product)
        else:
            # No Snowflake signal - RNG fallback
            roll = rng.random()
            if not is_activated or days_old < 30:
                status = "purchased_not_activated"
                notes = "recently purchased, activation pending"
            elif days_old < 90:
                # Newer account - some stalled
                if roll < 0.3:
                    status = "purchased_not_activated"
                    notes = "setup not completed"
                elif roll < 0.6:
                    status = "live_stalled"
                    notes = "minimal activity since activation"
                else:
                    status = "live_healthy"
                    notes = None
            else:
                # Mature account - calibrated to produce ~25% healthy, ~48% at_risk, ~27% cancel_risk at book level
                if roll < 0.09:
                    status = "live_at_risk"
                    notes = build_at_risk_note(product, rng)
                elif roll < 0.30:
                    status = "live_stalled"
                    notes = build_stalled_note(product, rng)
                elif roll < 0.40:
                    status = "purchased_not_activated"
                    notes = "purchased but never configured"
                else:
                    status = "live_healthy"
                    notes = None

        entry = {
            "product": product,
            "status": status,
        }
        if notes:
            entry["notes"] = notes

        # Add last_activity_date for live products
        if status in ("live_healthy", "live_stalled"):
            if status == "live_healthy":
                days_ago = rng.randint(1, 14)
            else:
                days_ago = rng.randint(45, 120)
            activity_date = (REF_DATE - timedelta(days=days_ago)).strftime("%Y-%m-%d")
            entry["last_activity_date"] = activity_date

        result.append(entry)

    return result


def build_at_risk_note(product: str, rng: random.Random) -> str:
    notes = {
        "xtraCHEF": ["no COGS report run in 90+ days", "invoices not processing", "menu not mapped to recipes"],
        "Toast Payroll": ["payroll run missed last cycle", "tip pool misconfigured, staff complaints", "time card sync errors"],
        "Employee Cloud": ["no new hires onboarded digitally in 60+ days", "I-9 process still manual"],
        "Toast Marketing": ["no campaigns sent in 90+ days", "loyalty enrollment under 10 guests", "guest feedback disabled"],
        "Websites + Online Ordering": ["no online orders in 45+ days", "menu out of sync with POS"],
        "Order & Pay": ["QR codes printed but staff not directing guests", "zero OO orders in 30 days"],
        "Catering & Events": ["events happening but no BEOs in platform", "deposit collection not configured"],
        "Toast Pay / STP": ["STP not active", "tip distribution still manual"],
    }
    options = notes.get(product, ["usage declining"])
    return rng.choice(options)


def build_stalled_note(product: str, rng: random.Random) -> str:
    notes = {
        "xtraCHEF": ["COGS report run once at setup, not since", "invoices uploading but no analysis run"],
        "Toast Payroll": ["payroll live but scheduling not adopted", "tip pool live but GM does manual override"],
        "Employee Cloud": ["2 new hires onboarded digitally, GM reverted to paper for others"],
        "Toast Marketing": ["one campaign sent at launch, nothing since", "loyalty live but no SMS campaigns"],
        "Websites + Online Ordering": ["website live but no menu updates in 60 days", "OO orders slow (1-5/week)"],
        "Order & Pay": ["QR codes at bar only, not tableside"],
        "Catering & Events": ["one BEO created, team not using for all events"],
        "Toast Pay / STP": ["STP active but tip prompt customization not set up"],
    }
    options = notes.get(product, ["low engagement since activation"])
    return rng.choice(options)


def compute_arr(acct: dict, products: list) -> int:
    """Compute ARR using real Snowflake vol_30d where available, else PRODUCT_ARR estimates."""
    raw_modules = acct.get("module_data", {})

    # Build product -> annualized ARR from real module vol data
    real_arr: dict = {}
    for mod_name, mod_row in raw_modules.items():
        product = MODULE_TO_PRODUCT.get(mod_name)
        if not product:
            if "xtrachef" in mod_name.lower():
                product = "xtraCHEF"
            else:
                continue
        vol = mod_row.get("vol_30d", 0) or 0
        if vol > 0:
            annualized = int(vol * 12)
            real_arr[product] = real_arr.get(product, 0) + annualized

    total = 0
    for p in products:
        if p["status"] == "not_purchased":
            continue
        product_name = p["product"]
        if product_name in real_arr:
            total += real_arr[product_name]
        else:
            total += PRODUCT_ARR.get(product_name, 0)
    return total


def compute_health(acct: dict, products: list, days_touchpoint: int) -> str:
    calls = acct.get("chorus_calls", [])
    # Check for cancel intent language (not product setup terms like "cancellation fee")
    all_text = " ".join(
        (c.get("summary", "") + " " + c.get("action_items", "")).lower()
        for c in calls
    )
    cancel_phrases = [
        "want to cancel", "thinking about cancelling", "looking to cancel",
        "considering cancelling", "switching away", "switching to a competitor",
        "not worth it", "overpriced", "too expensive", "cancelling our subscription",
        "cancel our contract", "cancel their contract",
    ]
    if any(phrase in all_text for phrase in cancel_phrases):
        return "cancel_risk"

    at_risk_count = sum(1 for p in products if p["status"] == "live_at_risk")
    stalled_count = sum(1 for p in products if p["status"] in ("live_stalled", "purchased_not_activated"))
    healthy_count = sum(1 for p in products if p["status"] == "live_healthy")

    # Cancel risk: explicit cancel language OR severe product failure + no recent Chorus call
    # Note: days_touchpoint = days since last Chorus-recorded call, not all contact channels.
    # Reps also use email and Salesloft, so 300+ days since a recorded call is meaningful but
    # not equivalent to 300 days of zero contact. Thresholds calibrated accordingly.
    if any(phrase in all_text for phrase in cancel_phrases):
        return "cancel_risk"
    if at_risk_count >= 2 and days_touchpoint > 300:
        return "cancel_risk"
    if at_risk_count >= 3:
        return "cancel_risk"
    if stalled_count >= 5 and days_touchpoint > 400:
        return "cancel_risk"
    if days_touchpoint >= 999:  # sentinel: no Chorus call on record at all
        if at_risk_count >= 1 or stalled_count >= 3:
            return "cancel_risk"

    # At risk: product failures or extended no-recorded-call cadence
    if at_risk_count >= 2:
        return "at_risk"
    if at_risk_count >= 1 and days_touchpoint > 180:
        return "at_risk"
    if stalled_count >= 3 and days_touchpoint > 250:
        return "at_risk"
    if days_touchpoint >= 999 and stalled_count >= 1:
        return "at_risk"
    if at_risk_count >= 1:
        return "at_risk"
    if stalled_count >= 2 and days_touchpoint > 180:
        return "at_risk"

    return "healthy"


def compute_flare_signals(acct: dict) -> list:
    """Compute Flare-style rule-based churn signals from available account data."""
    signals = []
    trend = acct.get("monthly_trend", [])
    case_data = acct.get("case_data", {})
    days_chorus = acct.get("days_since_touchpoint", 999)
    days_sf = acct.get("days_since_rep_contact", 999)
    days_contact = min(days_chorus, days_sf)  # best available signal

    # trajectory_decline: >=25% booking drop last 3m vs prior 3m (min 20 bookings/m prior avg)
    if len(trend) >= 6:
        prior_3m = [m["bookings"] for m in trend[-6:-3]]
        recent_3m = [m["bookings"] for m in trend[-3:]]
        avg_prior = sum(prior_3m) / 3 if prior_3m else 0
        avg_recent = sum(recent_3m) / 3 if recent_3m else 0
        if avg_prior >= 20 and avg_recent < avg_prior * 0.75:
            signals.append("trajectory_decline")

    # care_case: 2+ cases in 90d AND no contact in 45d
    if case_data.get("case_count_90d", 0) >= 2 and days_contact > 45:
        signals.append("care_case")

    # activation_gap: signed 21-90 days ago, not yet activated
    signed_str = acct.get("signed_date", "")
    if signed_str:
        days_since_signed = days_since(signed_str)
        is_activated = acct.get("is_activated", False)
        if 21 <= days_since_signed <= 90 and not is_activated:
            signals.append("activation_gap")

    return signals


def compute_days_touchpoint(acct: dict, seed: int) -> int:
    """
    Chorus call dates are from 2024-2025 so raw date math makes every account
    look untouched for 300-400 days, which is unrealistic.
    Instead: use the call recency pattern (relative ordering) to place accounts
    on a realistic distribution that reflects an AM's real book in Jul 2026.
    Target distribution: ~15% under 14d, ~30% 14-45d, ~30% 46-90d, ~15% 91-175d, ~10% 176+d
    """
    rng = random.Random(seed + 7777)
    roll = rng.random()
    if roll < 0.15:
        return rng.randint(3, 14)
    elif roll < 0.45:
        return rng.randint(15, 45)
    elif roll < 0.75:
        return rng.randint(46, 90)
    elif roll < 0.90:
        return rng.randint(91, 175)
    else:
        return rng.randint(176, 365)


def main():
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "rep-accounts.json")
    public_path = os.path.join(os.path.dirname(__file__), "..", "public", "rep-accounts.json")
    with open(data_path) as f:
        data = json.load(f)

    force = "--force" in sys.argv

    for email, rep in data.items():
        if email == "_meta":
            continue
        accounts = rep.get("accounts", [])
        for i, acct in enumerate(accounts):
            seed = abs(hash(email + acct.get("name", "") + str(i))) % (2**31)

            # Skip if already enriched (unless --force passed)
            if "products" in acct and not force:
                continue

            products = build_product_health(acct, seed)
            # Honor real Chorus-derived touchpoint if seeded; fall back to RNG only for unseeded accounts
            if 'days_since_touchpoint' in acct:
                days_touchpoint = acct['days_since_touchpoint']
            else:
                days_touchpoint = compute_days_touchpoint(acct, seed)
            arr = compute_arr(acct, products)
            health = compute_health(acct, products, days_touchpoint)
            flare_signals = compute_flare_signals(acct)

            # Use real open_cases from case_data when available; fall back to RNG
            case_data = acct.get("case_data", {})
            real_open = case_data.get("open_cases", -1)
            if real_open >= 0:
                open_tickets = real_open
            else:
                rng = random.Random(seed)
                open_tickets = 0
                if health == "cancel_risk":
                    open_tickets = rng.randint(1, 3)
                elif health == "at_risk":
                    open_tickets = rng.randint(0, 2)

            acct["products"] = products
            acct["days_since_touchpoint"] = days_touchpoint
            acct["total_arr"] = arr
            acct["account_health"] = health
            acct["flare_signals"] = flare_signals
            if open_tickets > 0:
                acct["open_support_tickets"] = open_tickets
            elif "open_support_tickets" in acct:
                del acct["open_support_tickets"]

        rep["accounts"] = accounts

    with open(data_path, "w") as f:
        json.dump(data, f, indent=2)
    with open(public_path, "w") as f:
        json.dump(data, f, indent=2)

    total_accounts = sum(len(rep.get("accounts", [])) for k, rep in data.items() if k != "_meta")
    print(f"Enriched {total_accounts} accounts across {len(data) - 1} reps.")


if __name__ == "__main__":
    main()