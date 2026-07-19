# AM Assist: Product Knowledge Layer
**Status:** Planning - v4, ready for cross-triad review  
**Last updated:** Jul 16, 2026

---

## The situation

In October-November 2026, 1,427 Tables locations representing $2.67M ARR enter a 6MF cancel window. AMs have 8-12 weeks to materially improve their effectiveness with those accounts before that window opens. The coaching loop below is the intervention. Here is why we believe it is buildable in that window.

---

## The problem

Toast AMs are not knowledgeable about the full product portfolio, and there is no good self-serve way for them to build that knowledge. Two distinct gaps:

**Gap 1 - Dark attach rate.** Tenured AMs have products they pitch confidently and products they quietly avoid. This does not show up as failed pitches - it shows up as zero attempts. The gap is invisible in Chorus recordings precisely because the conversation never starts. AMs will not pitch what they cannot explain fluently.

**Gap 2 - New AM ramp.** A new AM's product knowledge ceiling is set by their onboarding cohort, their manager's depth, and whatever they can find in Toast Central. No self-serve path to get confident on products not covered in training.

---

## Behavioral evidence

This is not an inference. The AM-level variance in non-Tables attach rates is the finding.

Across 611 AMs each managing 10+ active Tables accounts (20,238 accounts total, Jun 2026, `MONTHLY_CUSTOMER_MODULE_ARR`):

| Product | Median attach | Top AM | StdDev | MTAU-linked? |
|---------|-------------|--------|--------|--------------|
| OO | 87% | 100% | 13.5pp | Yes - activates guest ordering surface |
| xtraCHEF | 32% | 85% | 16.6pp | No - restaurant cost mgmt, ARR/POO story |
| Marketing | 67% | 100% | 17.5pp | Yes - activates guest promotional surface |
| Loyalty | 70% | 100% | 16.8pp | Yes - activates guest retention surface |

The xtraCHEF gap is the headline: 53pp spread between the top AM (85%) and the median (32%) on a 611-AM sample. Standard deviations of 13-17pp are consistent across every product. This pattern does not explain away as territory or product-market fit - an AM at 85% xtraCHEF is not working a fundamentally different book than one at 0%.

Two specific AMs - Morgan Innes (212 accounts, 9% OO attach) and Alexandra Brown (184 accounts, 9.8% OO attach) - represent ~400 accounts with near-zero OO attached. Source: Snowflake, Jun 2026.

Chorus signal (59 calls, Alexis Coutts book): genuine unprompted cross-sell pitches appear in ~3-5 calls. xtraCHEF, OO, Marketing, and Order & Pay are rarely initiated by the AM. Most non-Tables product mentions are support work on products already attached or customer-raised questions.

---

## Two commercial stories (kept separate)

**Story 1 - MTAU chain (OO + Marketing attach):**
Higher OO and Marketing attach on Tables accounts increases the number of activated guest-facing surfaces. More OO = more online ordering channels on toast.app. More Marketing = more promotional traffic to Toast Local. Each incremental OO-enabled restaurant activates a guest ordering surface. MTAU branch: Unique Guests per Restaurant per month. Second-order driver, 60-90 day lag. The relevant north star for Dario's tree.

Directional evidence: OO-attached Tables restaurants have 55% higher median booking volume (82 vs 53 bookings per 90 days, Mar-May 2026, SMB + Mid-Market, 16,779 OO-attached vs 3,459 not attached). This is a booking-volume proxy, not a guest-level MTAU decomposition. True MTAU attribution at the restaurant level requires a consumer-side join not available in `MONTHLY_CUSTOMER_MODULE_ARR`. The directional signal is real; the magnitude claim stops at "OO-attached restaurants show meaningfully more guest engagement." The MTAU link is a hypothesis, not a measured chain. State it that way in cross-triad.

**Story 2 - ARR per location (xtraCHEF + Payroll + Catering):**
These products do not activate guest-facing surfaces. Their commercial story is ARR-per-location - Mike's POO thesis. Moving xtraCHEF median 5pp across 20,238 locations = ~1,000 net new xtraCHEF attachments. At current xtraCHEF ARR per location, this is a direct ARR expansion play with no MTAU claim.

These two stories are true simultaneously. Conflating them weakens both.

---

## What we're building (four builds, sequenced)

**Build 1 - Attach intel panel (~2 weeks)**
Each AM sees their attach rate per product vs. cohort median and top decile. Diagnostic, not leaderboard. No other names visible. Wired into the Home tab of AM Assist.

This is the behavioral validation step. We do not price this product until Build 1 shows that AMs open the panel and correlate it to changed call prep behavior. Build 1 is not a feature - it is the experiment that validates whether the coaching loop thesis is real.

Data already exists: 611 AMs, 4 products, Jun 2026 Snowflake query already run.

Pre-condition (Build 1, not Build 3): spike the AM-to-account join key on 20 known AMs against `MONTHLY_CUSTOMER_MODULE_ARR` before Build 1 scopes. You cannot show an AM their attach rate without knowing which accounts are theirs. The spike must identify: (a) what field in AM Assist holds AM identity (email, SFDC rep ID, or other), (b) the corresponding field in `MONTHLY_CUSTOMER_MODULE_ARR`, (c) whether the mapping passes through a CRM table with a named cross-team owner. Required output: confirmed join path with <10% gap on the 20-AM sample, or a documented blocker. Timeline: complete before Aug 15 so Build 1 scopes with validated data.

**Build 2 - Top-performer Chorus analysis (parallel with Build 1)**
Pull call recordings from top-decile xtraCHEF AMs. Extract 3-5 specific entry lines they use to open these conversations. Editorial research, no new engineering. Output: a peer tips content layer per product surfaced in the attach intel panel.

Chorus dependency: if API access requires procurement review (~6 weeks), fall back to manual pull from existing rep-accounts.json data for v1.

**Build 3 - Evolve Prep tab (after Build 1 + 2)**
Today the Prep brief says "here is the account situation." The Build 3 version adds: top 3 attach opportunities for this account, ranked by the AM's personal gap vs. peers, with the specific entry line for each.

Gate: Build 3 does not start until Build 1 has 4 weeks of engagement data showing meaningful AM panel usage AND the 5-AM interview validation (see Pre-alignment) confirms knowledge is the constraint, not motivation or time allocation. If AMs are not opening the attach intel panel, the coaching loop hypothesis is wrong. If AMs open the panel but report that they know the products and choose not to pitch them, the problem is motivation or comp - Build 4 (Ask tab) solves nothing in that scenario.

Data visibility controls: the attach intel panel shows each AM only their own numbers vs. anonymous cohort benchmarks. No names visible. No manager view in Phase 1. Kill switch: panel can be disabled per rep without removing the underlying Snowflake pipeline. Add this to the Phase 1 eng scope - if managers start using this as a performance metric within 4 weeks of launch, the diagnostic intent breaks.

**Build 4 - Ask tab / product knowledge corpus (last)**
Product knowledge chat interface: AMs ask any product question and get an accurate, sourced answer. Not standalone Q&A - the research engine that handles objections in service of a pitch already identified by Build 3.

Corpus sources: support.toasttab.com (Layer 1, zero dependencies), PMM one-pagers via Sunny (Layer 2), CPPL Small Changes from Jira (Layer 3, labeled recency context), JPD content from CNSMR/CPPL/CCEP (Layer 4, labeled roadmap, access-controlled, independently feature-flagged).

Open architecture question: Toast IQ (sous-chef service) already has a product knowledge layer in `toastiq-registry`. KOC onboarding team registered as a remote MCP server in July 2026. AM Assist is building independently. This requires a documented decision with the sous-chef team (Sonora Braun / Dan Teoh) before Build 4 scopes - XSM will block on this.

---

## What's hard (three risks named)

1. **Corpus quality on complex products.** Layer 1 support docs may not be granular enough for xtraCHEF edge cases. Hypothesis: Layer 2 PMM content fills this gap. Validation: Phase 1 accuracy test against 20 real AM questions before any expansion.

2. **AM adoption of the coaching panel.** Seeing your gap vs. peers could be motivating or it could be demoralizing and ignorable. The evidence on diagnostic panels in sales tools is mixed. Validation: share the Build 1 prototype with 5 AMs in week 1, measure whether they change their call prep behavior in the following 2 weeks before full Phase 1 launch.

3. **Attach rate signal lag.** The 90-day cohort comparison is a lagging indicator. For the first 60 days of the pilot, query volume + session depth + Chorus pitch attempts are the proxy signals. Define these as the leading scorecard before Phase 1 launches.

---

## Success metrics

Metrics are separated by phase. Build 4 (Ask tab) is not in Phase 1.

**Phase 1 (pilot) - Build 1 kill condition:**
The panel WAU rate among the pilot cohort drops below 30% at week 4. If AMs are not opening the attach intel panel by Sep 29 (4 weeks post-launch), halt Build 3. Phase 2 does not launch.

**Phase 2 (cancel-window cohort) - primary metric:**
xtraCHEF attach rate in the Phase 2 AM cohort vs. matched control group. Measured at 90 days post-launch. Baseline: 32% median, Jun 2026. Target: +3pp vs control at 90 days. Source: Snowflake `MONTHLY_CUSTOMER_MODULE_ARR`. Denominator: AMs with 5+ logged calls in the period. (60 days is too short for xtraCHEF sales cycles. 90 days allows one full cycle plus buffer.)

**Kill condition (both phases):** If attach rate shows no difference at 90 days, the knowledge hypothesis is wrong. Root cause is comp, quota, or product-market fit. Plan ends unless the interview data from pre-alignment suggests a different intervention.

**Phase 2 leading indicators (weekly):**
- AM panel weekly active rate (pilot cohort vs. control)
- Non-Tables product mentions in Chorus call summaries
- xtraCHEF-specific mentions in Chorus summaries (proxy for attempts)

**Secondary:** New AM ramp - time to first non-Tables pitch attempt per product category (Chorus signal, Phase 3, with Sarah French's enablement team).

**Story 1 (MTAU - directional only, not a success metric):** OO attach rate change in Phase 2 cohort at 90 days. Do not commit a MTAU number to cross-triad review - the Snowflake data supports "OO-attached restaurants show 55% higher booking volume" as directional evidence, not a quantified MTAU attribution.

---

## Rollout

**Phase 1 - Pilot (Build 1 live: Sep 1)**
Alexis Coutts book, 80 accounts. She is a median-decile AM - chosen specifically because top-decile results would not generalize to the 611-AM population. Build 1 (attach intel panel) + Build 2 content (Chorus entry lines) live by Sep 1. Go/no-go gate: panel WAU above 30% at Sep 29 (4 weeks post-launch). Phase 2 does not start until the gate clears.

**Phase 2 - Cancel-window cohort (Build 3 live: Oct 1 earliest)**
Expand to AMs covering the 1,427 cancel-window locations ($2.67M ARR, Oct 3 window). Build 3 (personalized attach opps per account) added. Phase 2 cannot start before Oct 1 - that is Sep 1 + 4-week gate. The Oct 3 cancel window opens 2 days after Phase 2 earliest launch. The window is tight. Primary outcome is 90-day attach rate change (measured Jan 1), not a pre-cancel read.

**Phase 3 - Full rollout (Build 4: TBD, pending Phase 2 signal)**
Full AM onboarding integration with Sarah French's enablement team. Build 4 (Ask tab) added. This is an internal sales enablement tool - not a revenue line. The quality bar is "good enough that an AM would choose this over not having it," not a pricing exercise. Commercial case: reduced new-AM ramp time + retained ARR from cancel-window accounts.

---

## Pre-alignment required before cross-triad review

| Person | Ask | Timeline | Why |
|--------|-----|----------|-----|
| XSM / eng lead | AM-identity join spike (named fields, gap rate, CRM owner) | Before Aug 15 | Build 1 pre-condition - cannot scope without it |
| Sous-chef team (Sonora Braun / Dan Teoh) | Document independent-build vs. shared registry decision | Before Sep 1 | Changes Build 4 architecture; may change how Build 1 stores data |
| 5 low-attach AMs (structured interview) | "Do you know how to pitch xtraCHEF? Do you choose not to?" | Before Sep 1 | If the answer is choice, not knowledge, Build 4 is wrong and Build 3 is a nudge problem |
| Sunny Chen | Layer 2 PMM content ask | Before Oct 1 | Build 4 dependency |
| Craig | Phase 3 scope awareness (internal enablement tool, not a product SKU) | Before cross-triad | Craig should know this is being built before it lands in his org |
| Sarah French | Phase 3 onboarding integration intent | Before Phase 3 scopes | Phase 3 dependency, not blocking Phases 1-2 |

Data queries completed before this version:
- OO-attached vs. non-attached Tables restaurants on booking volume: 55% higher median (82 vs 53/90 days). Used as directional evidence for Story 1; not a MTAU claim.
- AM-to-account join spike: pending (must complete before Aug 15).