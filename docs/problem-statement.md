---
title: tables-rep-assist -- Problem Statement
updated: 2026-07-28
data-sources:
  - config_checker_activation_retention (Snowflake, Jan 2025--Jun 2026 cohort, clamped to [0,365], queried 2026-07-28)
  - downsell_arr_monthly_aggregate (Snowflake, Sep 2024--Jul 2026, queried 2026-07-22)
---

## The problem

Toast Tables generates $22.3M in ARR across 15,854 active restaurant locations (Jul 2026).
Monthly downsell is running $330--460K/month -- approximately $4--5M annualized.

The largest single driver of that churn is delayed or failed activation.

Of all restaurants that signed on to Tables between Jan 2025 and Jun 2026:
- **25% (2,605 of 10,306) never took a single booking.**
- Restaurants that never activate churn at 2x the rate of activated restaurants: **48.5% vs. 83.0% 90-day retention.**
- That 34-point retention gap is the difference between a restaurant that is paying and engaged and one that is paying and counting down to cancel.

Note: 81 restaurants were migrators with first-booking dates predating their contract live date (historical imports). These are excluded from the activation speed analysis -- they have 100% 90-day retention and are not at risk. The activation gap is calculated on the remaining 10,225 restaurants.

Account Managers own the relationship between Toast and these restaurants. They are the primary lever between a restaurant that stalls and one that activates. But today AMs go into calls without the context they need:

- They don't know which accounts to call today and why.
- They don't have a quick summary of the last conversation or what was left unresolved.
- They spend 30--45 minutes per call digging through Salesforce, Chorus, and open tickets -- time they don't have across a 33-account book.
- When they do call, they often open with generic language because they don't have account-specific context to do otherwise.

The result: at-risk accounts churn before anyone calls, and Backlog accounts stall because the AM doesn't have enough context to run a productive activation conversation.

## What we're building

An AI tool that gives AMs the right context, at the right moment, for every account in their book:

- **Before the day starts:** a prioritized list of the 5 accounts that most need attention today, with a one-sentence action for each. Example: "No booking in 18 days since go-live -- call to walk through first reservation setup."
- **Before a call:** a pre-call brief built from Chorus summaries, open tickets, and account signals -- who is the contact, what was last discussed, what is the recommended opener. Signals include: days since last booking, open support tickets, product portfolio gaps (e.g. Tables live but no Waitlist configured), and days since last AM touchpoint.
- **On the call:** live objection handling and product positioning, surface-aware to what the customer has already signed.
- **After the call:** a feedback signal back to the system so the same account doesn't surface again tomorrow.

## What success looks like (90-day target)

**Primary metric: days-to-first-booking for Backlog accounts** -- measured against a pre-tool baseline, week over week.

Definition: days from `INITIAL_CONTRACT_LIVE_DATE` (Tables) to first non-cancelled booking in `TOAST_TABLES_BOOKINGS`, per restaurant. Baseline query: `config_checker_activation_retention` (Jan 2025--Jun 2026 cohort, queried 2026-07-28).

**Secondary metrics (tracked separately -- different AM actions, different success signals):**

1. **Newly activated this month:** restaurants in Backlog status that took their first booking. AM action: activation coaching. Success: this number goes up week over week.
2. **Retained activated:** restaurants that had bookings and still have bookings 90 days later. AM action: expansion and relationship maintenance. Success: retention rate moves toward the 83% baseline.
3. **Saved at-risk:** accounts flagged as at-risk that did not churn after an AM touchpoint, vs. hold-out. AM action: proactive outreach on the right accounts. Success: hold-out churn rate exceeds touched churn rate by a measurable margin.

Conflating these three populations in a single metric would make it impossible to know which AM action drove the result.

## The three things not working today

1. **At-risk signals are unvalidated.** The current tool surfaces "180 days no contact" and "open tickets" as risk signals. Neither has been backtested against actual churn events. We are showing AMs signals that may not predict churn.

2. **No feedback loop.** AMs cannot mark an account as contacted. The same at-risk account surfaces every day regardless of whether the AM just spoke to them. The system cannot learn.

3. **Mobile is broken.** The tool has 7 top-level tabs. AMs use this on-site, between visits, on their phones. The current nav does not work at 390px.

## The fourth thing not working: no coaching signal

AMs don't operate in isolation. Their managers need visibility into account coverage -- which accounts got touched this week, which didn't, and whether prioritization decisions line up with what's at risk.

Today the tool generates zero signal for managers. If an AM ignores every Backlog account in their book for two weeks, no one knows. Adding even one metric -- accounts contacted / accounts prioritized, per rep per week -- changes the adoption dynamic. Managers pull for tools that give them visibility. That visibility also tells us whether the tool is changing behavior.

This is item 14 on the build plan: feedback loop + at-risk success metric.

## The bet

Early activation predicts retention with a 34-point gap. AMs are the humans who close that gap. If they have better context before every call, more Backlog accounts activate faster, and more at-risk accounts are saved before the cancel window opens.

The bet is that AM context quality -- not call volume, not product features -- is the primary constraint on activation and retention right now.

## ARR at risk and ARR to gain

**Churn defense:**
- 2,605 restaurants in the Jan 2025--Jun 2026 cohort never activated. At average ARR of ~$1,400/location, that represents ~$3.6M in ARR with a 51% churn probability within 90 days.
- Monthly downsell running $330--460K. Even a 10% reduction in never-activated churn rate would save ~$180K ARR/month.

**Expansion:**
- Activated restaurants that are retained are also the ones who expand. The 83.0% retention cohort contains the accounts most likely to add Waitlist, upgrade their Tables tier, or expand to additional locations.
- An AM with better context before every call is also better positioned to identify when an account is ready to expand -- not just which accounts are at risk of leaving. The same pre-call brief that flags "no booking in 18 days" also flags "active for 6 months, Tables only, no Waitlist configured."
- The tool is designed to surface both signals in the same workflow.

## What this is not

This is not a consumer product. It does not move MTAUs. It does not touch guest-facing surfaces.

It moves ARR by making AMs more effective -- retained ARR (fewer cancels), activated ARR (Backlog accounts going live), and expanded ARR (right upsell at the right account at the right time).

## Current state

- Deployed at tables-rep-assist.vercel.app
- ~10 reps in the pilot (ellie.weber@toasttab.com as primary demo account)
- Real Snowflake data, OpenAI API for chat
- Auth: passphrase + @toasttab.com email (migrating to OAuth)
- SECR ticket pending: OpenAI vendor review required before wider rollout
