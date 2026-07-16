# Pre-Pilot Plan: Seed Real AM + 5-Interview Gate
**Owner:** Dan Barnes
**Deadline:** Aug 15 (before Sep 1 pilot)
**Status:** In progress

---

## Problem

Build 1 is live but shows dashes for every demo account. Two things must happen before Sep 1:

1. **Real AM data seeded** - At least one real AM has actual attach rate numbers in the panel. Every stakeholder conversation before Sep 1 needs to show a real panel, not placeholders.

2. **5-AM interview gate** - Before Build 3 scopes, confirm that knowledge is the constraint (not quota structure, territory, or choice). If AMs say "I know how to pitch xtraCHEF, I just don't bother," Build 4 is wrong.

---

## Track 1: Seed real AM data

### Step 1a: Identify the pilot AM
Alexis Coutts is the named pilot AM in the plan. Need to confirm:
- Is she a real Toast AM (not a fictional demo account)?
- Does she have consent to have her Snowflake data surfaced in a tool?
- Does her email resolve in EMPLOYEE_CURRENT?

If she is real and consents: run `refresh_am_data.sh --weekly alexis.coutts@toasttab.com`.
If not real: identify a real AM with 40-80 Tables accounts who is willing to be the pilot.

### Step 1b: Query candidate AMs from Snowflake
Pull real AMs with:
- 40-80 live Tables accounts (manageable pilot size)
- xtraCHEF attach rate below median (32%) - they have the most to gain
- Active in Chorus (at least 3 recorded calls in last 6 months)

Query: `scripts/query_pilot_candidates.py` (to be written)

### Step 1c: Seed the pilot AM
Once confirmed:
```bash
cd ~/tables-pm-workspace
bash ../tables-am-assist/scripts/refresh_am_data.sh --weekly <pilot-am@toasttab.com>
cd ~/tables-am-assist && npx vercel deploy --prod
```

Verify: panel shows real numbers, not dashes.

---

## Track 2: 5-AM interview guide

### The core question
"Do you know how to pitch xtraCHEF to a Tables customer? If yes - why don't you pitch it more?"

This is a binary: knowledge gap vs. choice. If choice, Build 3 and 4 are wrong.

### Interview candidate criteria
- AM manages 20+ Tables accounts
- xtraCHEF attach rate below 25% (confirmed low-attacher)
- Mix: 2 new AMs (<6 months), 3 tenured (1+ year)
- Not top performers - they already know the products

### Interview structure (20 min max)
File: `docs/AM_INTERVIEW_GUIDE.md` (to be written)

Core questions:
1. Walk me through what you know about xtraCHEF. What does it do for a restaurant?
2. When you're in a call with a Tables customer, how often do you bring up xtraCHEF?
3. When you don't bring it up - what's the reason?
4. If you had a tool that showed you exactly which of your accounts don't have xtraCHEF and how that compares to your peers - would that change your behavior?
5. What would make you more likely to pitch it?

### What the answers tell us
| Answer pattern | Diagnosis | Implication |
|---|---|---|
| "I don't really know it well enough" | Knowledge gap | Build 4 is right |
| "I know it but it doesn't fit most of my accounts" | Territory/fit | Build 3 wrong, investigate territory data |
| "I know it but quota doesn't reward it" | Incentive gap | Out of scope for this tool |
| "I just focus on Tables renewal first" | Prioritization gap | Build 1 CTA + Build 3 are right |
| "I pitch it but restaurants aren't interested" | Product/market fit | Different problem entirely |

---

## Milestone checklist

- [ ] Confirm pilot AM identity (real vs. fictional)
- [ ] Query Snowflake for real pilot AM candidates (if Alexis is fictional)
- [ ] Run `refresh_am_data.sh --weekly` for pilot AM
- [ ] Verify panel shows real numbers in prod
- [ ] Write `AM_INTERVIEW_GUIDE.md`
- [ ] Identify 5 interview candidates from Snowflake low-attach list
- [ ] Conduct 5 interviews (Dan)
- [ ] Record findings in `docs/INTERVIEW_FINDINGS.md`
- [ ] Gate decision: proceed to Build 3 or pivot

**Gate:** Both tracks complete by Aug 15. Build 3 does not scope until interview findings are recorded.