# Toast Tables ROI Calculator — Build Plan
*Created: Jul 12, 2026 | Priority: P0 before Tanguy demo Jul 14*

## The problem it solves

The #1 reason we lose deals: "OpenTable sends us guests. What does Toast send us?"
The calculator answers that question with actual data from comparable restaurants — not promises.

## The argument structure

Not just "save money on OT fees." The full narrative:

1. **Cost relief** — switch from OT, reclaim $X/year in per-cover fees
2. **Demand gen you already get** — Google (RwG) sends comparable [Fine Dining / Casual] restaurants in your state an average of [58-79] bookings/month. Free. Included.
3. **Demand gen you can invest in** — take the OT savings, put some into Email Marketing and Toast Ads. Here's what comparable restaurants see.
4. **Net position** — you're not losing a network. You're trading a per-cover fee for owned demand.

Owner.com plays this game. We need to play it too.

---

## Data we have (grounded in Snowflake, July 2026)

### Google (Reserve with Google) — strongest signal
| Category | Avg bookings/month from Google (RwG) |
|----------|--------------------------------------|
| Fine Dining | **79.4** |
| FSR - Diner | 96.9 |
| FSR (general) | 73.9 |
| Casual Dining | **58.5** |
| FSR - Casual | 52.6 |
| FSR - Bar | 34.9 |

Source: TOAST.PRODUCT.TOAST_TABLES_BOOKINGS, SOURCE='GOOGLE', last 3 months, N=631–4,135 restaurants per category. This is observed, not modeled.

### Toast Local (LOCAL_WEB)
- Average: **10.5 bookings/month** per restaurant today
- Directional: growing post-Jun 29 redirect ramp. Floor, not ceiling.
- Regional variation: ME (22.4), UT (22.4), MO (23.0) outperform; WI (9.1), GA (9.7) below average

### Email Marketing lift
- Data gap: SALESFORCE_ACCOUNTID join to EM product table not returning matched restaurants
- Cannot confirm lift from Snowflake today
- Use directional placeholder: "Restaurants using Toast Email Marketing report [X]% higher repeat visit rates" — needs [CONFIRM WITH PM] tag until verified
- Assumption to bake in: +15% repeat booking frequency for EM users (conservative industry benchmark, clearly labeled as assumed)

### Toast Ads
- No internal ROI data
- External benchmark: restaurant Google Ads typical ROAS 3-5x on food/bev campaigns
- In calculator: user inputs monthly budget, model outputs "estimated bookings driven" using $8-12 CPA assumption, labeled [DIRECTIONAL — varies significantly]

---

## Two versions

### Internal version (rep-facing, in rep-assist)
- Shows all assumptions explicitly
- Shows N of comparable restaurants the data is based on
- Rep can adjust: avg check size, party size, nights/month
- Source labels on every number: [Observed: 631 fine dining restaurants] vs [Assumed: industry benchmark]
- Use to build conviction before the call. Never read this version to a customer.

### Customer-facing version (shareable one-pager)
- Clean output: "Estimated annual value of switching to Toast Tables"
- Three sections: Cost Relief | Google Discovery | Growth Investment
- Prominent disclaimer (Carter review before live): 
  "These estimates are directional only, based on aggregated data from comparable restaurants. Actual results vary. This is not a guarantee of performance."
- Formatted as Magic Patterns shareable one-pager, exportable as PDF

---

## Build sequence

### Step 1 — ROI tab in rep-assist (2-3 hrs)
New tab: "ROI" in the tab bar between Train and Prep.

**Form inputs:**
- Restaurant category (dropdown: Fine Dining / Casual Dining / Bar / Pizzeria / Other FSR)
- State (dropdown)
- Current platform (OpenTable Basic/Core/Pro / Resy / Phone only / Other)
- Monthly covers (number — default 2,200 for medium)
- Average check per cover (number — default $45)
- Email Marketing: yes/no toggle
- Monthly Toast Ads budget: slider $0–$500

**Backend:**
- Hardcode the Google RwG baseline table (category × state averages from Snowflake query above) as a JSON constant in `lib/roi-data.ts`
- For state-specific lookup: use category × state combo; fall back to national average if state has < 10 restaurants in dataset
- OT savings: reuse the calculator formula already in system prompt
- EM uplift: +15% on repeat booking frequency if toggled (labeled [ASSUMED])
- Ads: (budget / $10 CPA) = estimated new bookings/month (labeled [DIRECTIONAL])

**Output panels — internal view:**
- Panel A: Cost Relief — OT annual savings, math shown
- Panel B: Google Discovery — "X comparable [category] restaurants in [state] receive avg Y bookings/month from Google (RwG), based on N restaurants" — convert to annual revenue at their check size
- Panel C: Toast Local — "avg 10.5 bookings/month per restaurant nationally, growing" — convert to revenue
- Panel D: EM uplift — toggle-gated, labeled [ASSUMED]
- Panel E: Toast Ads — input-gated, labeled [DIRECTIONAL]
- **Total estimated annual value** — sum of all panels
- "View as Customer" button — switches to clean output

**Customer view toggle:**
- Hides all assumption labels and N counts
- Shows clean dollar amounts with disclaimer block
- "Share" button: opens MP one-pager with the filled numbers

### Step 2 — `lib/roi-data.ts` (30 min)
Hardcoded constants from Snowflake query:
- `GOOGLE_BOOKINGS_BY_CATEGORY` — national averages by category
- `TOAST_LOCAL_MONTHLY_AVG` — 10.5 national, with state overrides for top states
- `OT_PRICING` — Basic/Core/Pro monthly fees, $1.50/cover rate

### Step 3 — Magic Patterns one-pager (1.5 hrs)
New MP artifact: "Toast Tables ROI One-Pager"
- 3 sections: Cost Relief | Google Discovery | Growth Investment
- Dynamic — rep fills numbers in rep-assist, one-pager renders them
- OR: static template with [bracket] placeholders rep fills on screen share
- Registered in `docs/MAGIC_PATTERNS_DECKS.md`

### Step 4 — Disclaimer copy (30 min, Carter review needed)
Draft to Carter before sharing with any customer:
> "Results shown are estimated based on aggregated, anonymized data from [N]+ Toast Tables restaurants in comparable categories. Actual bookings, revenue, and savings will vary based on your specific market, operations, and use of Toast products. This tool is for directional planning purposes only and does not constitute a guarantee of performance. Toast makes no warranty regarding the accuracy of these projections."

---

## What we're NOT doing (important)

- No live Snowflake query per rep session — hardcode the category/state baseline table
- No per-restaurant data shown to customers — aggregated only
- No Email Marketing specific customer data in the customer view
- No specific restaurant names in the demand gen comparison
- Toast Ads ROI is disclaimed as directional — we don't have internal ROAS data

---

## Legal gate

Before the customer-facing version goes live:
1. Build internal version first (Jul 14 demo: internal only)
2. Draft disclaimer copy
3. DM Carter Parker the one-pager + disclaimer for a quick review
4. Customer-facing version goes live after Carter approves

For Jul 14: show Tanguy the internal version. The numbers will land. The "View as Customer" toggle can be demoed as "here's what we'd show the prospect."

---

## Success criteria

- Rep fills the form in < 60 seconds
- Google RwG number is the anchor: "restaurants like yours get [58-79] bookings/month from Google, free, on day one"
- OT savings + Google discovery together tell the full story: "you're not losing a network, you're gaining one"
- Customer-facing version passes Carter review
- Tanguy can demo this on Jul 14 as "coming soon" or as a working prototype

