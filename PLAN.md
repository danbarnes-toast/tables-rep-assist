# Tables Rep Assist — Product Plan
*Last updated: Jul 11, 2026*

## What this is
A web app for Toast Tables sales reps (starting with Growth/NB, e.g. Tanguy) that replaces scattered Slack threads, stale decks, and tribal knowledge with a single tool that covers the full sales motion: training, prep, in-call assist, and follow-up.

Not a chatbot. A rep operating system with a chat interface as one of several surfaces.

---

## Modes / Navigation (top-level tabs)

### 1. Ask (current — needs UX fix)
In-call and prep Q&A. Competitive objections, feature questions, qualifying guides, talk tracks.
- Fix: render markdown properly (bold, lists, blockquotes)
- Fix: suggestion tiles are generic — personalize to rep's region and recent accounts
- Add: "copy response" button for pasting into Slack/email

### 2. My Accounts
Rep-specific view. Requires knowing who the rep is (see Auth section).
- **Recent bookings for my customers** — pull from Snowflake (MAIN_BOOKING_CURRENT) filtered by rep's account list. Show: bookings/month trend, last active date, activation status.
- **Similar accounts in my geography** — show 3–5 comparable activated accounts in same MSA/region. Used for social proof: "Here's a similar restaurant in Austin that activated in 2 weeks."
- **At-risk flags** — accounts that have gone quiet, low activation, or dropped booking volume.

### 3. Train
Self-serve onboarding and ongoing education. Critical for new reps (Tanguy onboards July 14).
- **Product fundamentals** — what Tables is, how it works, key differentiators vs POS-native competitors
- **Case studies by use case** — fine dining, events/ticketing, large groups, multi-location chains
- **Competitive deep dives** — OpenTable, Resy, SevenRooms, Tock, Eventbrite. Full feature comparison, pricing, switching objections.
- **Qualification guide** — ICP scoring, red flags, fast-path signals
- **Progress tracking** — which modules completed (nice to have, not MVP)

### 4. Build Pitch
Generate a leave-behind or deck for a specific prospect.
- Input: account name, restaurant type, location, current provider, key pain points
- Output: a 5–7 slide narrative (exportable PDF or shareable link) covering: the problem, Toast Tables solution, relevant case study, ROI framing, next steps
- Uses Magic Patterns deck infrastructure we already have
- Pulls live stats from stat registry for accuracy

### 5. Demo (later)
Sandbox environment where rep can show Tables UI without needing a real account.
- Could be a read-only preprod account (preprod.eng.toast.app) with demo data loaded
- Or a recorded walkthrough with hotspots (Arcade/Loom-style)
- Out of scope for MVP but should be designed for from day one

---

## Stats and data access controls

**The problem:** Some stats are external-safe, some are internal-only, some are embargoed.

**Proposed tiers:**

| Tier | Examples | Visible to rep? |
|------|----------|-----------------|
| Public / external-safe | "16,000+ locations", activation rate ranges, general feature claims | Yes — always |
| GTM-approved | Specific ARR figures, attach rates by team, exact location counts | Yes — with [External OK] label |
| Internal-only | Finance plan vs actuals, PM roadmap details, engineering timelines | No — blocked at system prompt level |
| Rep-confidential | Another rep's accounts, unpublished win/loss data | No |

Implementation: system prompt already has `[CONFIRM WITH PM]` / `[External OK]` / `[Internal only]` labels. Need to:
1. Hard-block Internal-only stats from being surfaced (remove from system prompt or gate in API)
2. Show GTM-approved stats with a visual badge that signals "safe to share with prospect"

---

## Auth / identity

Currently: open to anyone on toast-v0 Vercel team (Toast Okta SSO).

To enable "My Accounts" mode, we need to know WHO the rep is:
- **Option A (fast):** Ask rep to type their name/email on first use. Store in localStorage. No backend needed. Good for POC.
- **Option B (proper):** Read the Vercel auth token (the SSO session includes the user's email). Pass it to the API route. Snowflake query filters by `rep_email`. Needs 1 backend change.

Option A for July 14 POC. Option B for V2.

---

## Data integrations

| Data | Source | Query | Status |
|------|--------|-------|--------|
| Bookings by account | Snowflake MAIN_BOOKING_CURRENT | `booking_history_by_account` | Needs writing |
| Activation status | Snowflake | `activation_status_by_account` | Needs writing |
| Similar accounts (geo) | Snowflake | `similar_accounts_by_msa` | Needs writing |
| Stats pack | `data/stat_registry.json` | already in system prompt | Live |
| Competitive intel | `projects/competitive-intel/` | needs to be added to system prompt | Needs adding |

For July 14: stats pack only (already live). Account-level data is V2.

---

## UX fixes needed now

1. **Markdown rendering** — `**bold**` showing as asterisks. Add a `MarkdownText` component that renders bold, lists, blockquotes, headers. ~30 min fix.
2. **Response formatting in system prompt** — GPT-4o is returning prose with inline asterisks. Update system prompt to output cleaner structure: short answer first, then details, not wall-of-text.
3. **Empty state** — replace generic tiles with mode-specific entry points (Ask / Train / Build Pitch)
4. **Mobile** — currently desktop-only layout. Reps may use this on their phone before a call.

---

## Build sequence

### Now (before July 14)
- [ ] Fix markdown rendering
- [ ] Update system prompt response format
- [ ] Add training content (case studies, onboarding path, product fundamentals)
- [ ] Add competitive intel to system prompt
- [ ] Basic mode navigation (Ask / Train tabs at minimum)

### V2 (July–August)
- [ ] My Accounts tab with Snowflake integration
- [ ] Rep identity (Option A: localStorage)
- [ ] Similar accounts in geography
- [ ] Stats access control tiers

### V3
- [ ] Build Pitch generator
- [ ] Demo environment
- [ ] Mobile optimization
- [ ] Rep progress tracking (Train module)

---

## Open questions

1. **Who owns this long-term?** Is this a Dan/PM project or does it become a Sales Enablement product?
2. **Which sales team first?** Growth AEs (Tanguy's team) vs Inside vs Field?
3. **Snowflake access for deployed app?** The app runs on Vercel serverless — needs a Snowflake service account, not SSO. Who sets that up?
4. **Stats approval process?** Who signs off that a stat is GTM-safe before it goes in the system prompt?
5. **Demo environment?** Does a preprod sandbox account exist? Who manages demo data?
