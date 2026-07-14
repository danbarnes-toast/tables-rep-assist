# Tables Rep Assist — Product Plan
*Last updated: Jul 11, 2026*

## Vision
A pre/during/post-call operating system for Toast Tables AEs. Every mode is grounded in real
data — deal state, Chorus call history, live booking proof — not just a chatbot.

**North star pattern:** Mirror Nova (OC briefs) but for AEs. Same infrastructure
(Snowflake + Chorus + Claude), different role and data joins.

---

## IA — 5 modes

| Mode | Job | When |
|------|-----|------|
| **Prep** | Pre-call brief from Chorus history + deal stage | Before a call |
| **Ask** | In-call Q&A — objections, features, stats | During a call |
| **Proof** | Live screenshots of real toast.app booking pages by category | During a Zoom |
| **Follow-up** | Draft follow-up email from Chorus action items | After a call |
| **My Accounts** | Pipeline view, activation status, last Chorus call date | Anytime |

Train collapses into Ask — rep says "teach me about X" and Ask handles it.

---

## Data sources

| Source | What it provides | Table |
|--------|-----------------|-------|
| Snowflake / Opportunity | Deal stage, product SKU, close date | `TOAST.GTM.OPPORTUNITY` + `OPPORTUNITY_LINE_ITEM_FACT` |
| Snowflake / Chorus | Full transcript, AI summary, action items | `TOAST.CS_ONBOARDING.CHORUS_AI_ENGAGEMENTS` |
| Snowflake / Activation | Is account live, activation date | `TOAST.ANALYTICS_CORE_ARR.CURRENT_MODULE_ACTIVATION_ADOPTION` |
| CDP / toast.app | Live screenshot of real booking page | Direct via Chrome DevTools |

---

## Build sequence

### Step 1 — Chorus seeder ✅ DONE
Extend `scripts/seed_rep_accounts.py` to pull the last 3 Chorus call summaries + action items
per account (joined via `SALESFORCE_ACCOUNTID`). Writes into `data/rep-accounts.json` under
each account's `chorus_calls` key. This is the data foundation for Prep and Follow-up.

**Query:** `CHORUS_AI_ENGAGEMENTS` joined to rep's won accounts via `SALESFORCE_ACCOUNTID`.
Fields: `SUMMARY`, `ACTION_ITEMS`, `CREATED_TIMESTAMP`, `ACCOUNT_NAME`, `PARTICIPANTS`.

### Step 2 — Prep mode UI
New tab. Rep types a prospect/account name. Pulls from seeded Chorus data for that account:
last call summary, open action items, deal stage. Claude generates a 1-page pre-call brief:
what was discussed before, what was promised, suggested opening angle.

Fallback for prospects with no Chorus history: similar-account proof points + standard
talk track for their category (fine dining, casual, event venue).

### Step 3 — Follow-up mode UI
New tab. Rep selects an account (or types name). Pulls latest Chorus action items. Claude
drafts a follow-up email: specific to what was discussed, includes relevant activation stat,
links to their toast.app booking page if they're live.

### Step 4 — Proof mode UI
New tab. Category picker: fine dining / wine bar / events / cooking class / supper club.
CDP screenshots the relevant toast.app booking page live. Rep shares screen on Zoom and
shows prospect a real, working booking page in their category.

Bonus: if rep has a prospect typed in, auto-suggest the closest matching category.

### Step 5 — My Accounts enhancements
Add to each account card:
- Last Chorus call date + one-line summary
- Activation countdown (days since signed, target 30d)
- Suggested next action (e.g. "Setup call overdue — draft nudge?")

---

## Stats and data access controls

| Tier | Examples | Visible to rep? |
|------|----------|-----------------|
| Public / external-safe | "16,000+ locations", activation rate ranges | Yes — always |
| GTM-approved | Specific ARR figures, attach rates | Yes — with [External OK] badge |
| Internal-only | Finance plan vs actuals, roadmap details | No — blocked at system prompt |

---

## Auth / identity
Currently: email typed on first use, stored in localStorage. Seeds data via Snowflake.
V2: read Vercel SSO token to auto-identify rep.

---

## Connection to Nova
Nova is the OC-facing version of the same pattern. Rep Assist is the AE-facing version.
Both use Chorus + Snowflake as the data backbone. Both use Claude to generate briefs and
draft emails. Shared infrastructure; different role filters.

---

## Future / out of scope for now
- Push to Cowork (Claude Desktop) so reps use without opening a URL
- Auto-refresh seeded data on a daily schedule
- TAM/Salesforce open pipeline view
- Multi-rep support without manual seeding (API-based lookup at query time)
- Build Pitch generator (Magic Patterns deck per prospect)
- Demo environment (preprod sandbox with demo data)
