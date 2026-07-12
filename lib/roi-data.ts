// ROI Calculator data constants
// All figures labeled by confidence level — internal mode shows labels, customer mode suppresses [ASSUMED]/[DIRECTIONAL]

// OT pricing tiers — publicly available, matches competitive-intel/SlideCostMatrix
export const OT_TIERS = {
  basic: { label: 'Basic', monthlyBase: 149, perCover: 1.50 },
  core:  { label: 'Core',  monthlyBase: 249, perCover: 1.50 },
  pro:   { label: 'Pro',   monthlyBase: 449, perCover: 1.50 },
} as const
export type OtTierKey = keyof typeof OT_TIERS

export const TABLES_MONTHLY = 199

// Google RwG observed data — SOURCE='GOOGLE' in TOAST_TABLES_BOOKINGS
// Snowflake query, Q1 2026, 3-month average. N per category: 631–4,135 restaurants.
// Confidence: OBSERVED (internal — do not share methodology with customers)
export const RWG_BY_CATEGORY = {
  fine_dining:   { label: 'Fine Dining',   avgMonthly: 79.4,  avgCheck: 85 },
  fsr_diner:     { label: 'FSR / Diner',   avgMonthly: 96.9,  avgCheck: 55 },
  fsr_general:   { label: 'Casual FSR',    avgMonthly: 73.9,  avgCheck: 50 },
  casual_dining: { label: 'Casual Dining', avgMonthly: 58.5,  avgCheck: 45 },
  bar:           { label: 'Bar / Tavern',  avgMonthly: 34.9,  avgCheck: 35 },
} as const
export type CategoryKey = keyof typeof RWG_BY_CATEGORY

// Toast Local (SOURCE='LOCAL_WEB') — national average post-Jun 29 redirect
// Confidence: OBSERVED
export const TOAST_LOCAL_MONTHLY_AVG = 10.5

// Email marketing booking lift — industry benchmark, no internal Snowflake data
// Source: Klaviyo / SevenRooms published benchmarks
// Confidence: ASSUMED
export const EM_LIFT_PCT = 0.15

// Toast Ads CPA range — directional, no internal ROAS data confirmed
// Confidence: DIRECTIONAL
export const ADS_CPA_LOW = 8
export const ADS_CPA_HIGH = 12

// Monthly spend assumption for Ads ROI estimate
export const ADS_MONTHLY_SPEND_DEFAULT = 500

// Network attribution anchor — SevenRooms "State of Restaurant Reservations" 2023
// ~9% of OT bookings come through OT's own discovery app; rest is organic/RwG/direct
// Confidence: CITED (public report — verify link before customer share)
export const OT_NETWORK_PCT = 0.09

export type ConfidenceLabel = 'OBSERVED' | 'ASSUMED' | 'DIRECTIONAL' | 'CITED'