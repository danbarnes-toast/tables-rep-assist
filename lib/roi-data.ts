// ROI Calculator data constants
// Confidence levels: OBSERVED (Snowflake), ASSUMED (benchmark), DIRECTIONAL (estimate), CITED (public report)

export type PlatformTierKey = string;

export type PlatformTier = {
  label: string;
  platform: string;
  monthlyBase: number;
  perCover: number;
  note?: string;
}

// Pricing tiers -- sourced from SlideCostMatrix.tsx (competitive-intel, July 2026)
// Use low end of ranges for ROI calc; note field surfaces caveat to rep
export const PLATFORM_TIERS: Record<PlatformTierKey, PlatformTier> = {
  // OpenTable: $149-499/mo + $1-1.50/cover (public pricing pages)
  ot_basic: { label: 'OpenTable Basic',  platform: 'OpenTable', monthlyBase: 149, perCover: 1.00, note: '$1-1.50/cover; verify with prospect' },
  ot_core:  { label: 'OpenTable Core',   platform: 'OpenTable', monthlyBase: 249, perCover: 1.50 },
  ot_pro:   { label: 'OpenTable Pro',    platform: 'OpenTable', monthlyBase: 449, perCover: 1.50 },
  // Resy: $249-899/mo, per-cover varies by tier (SlideCostMatrix July 2026)
  resy_basic: { label: 'Resy Basic', platform: 'Resy', monthlyBase: 249, perCover: 0, note: 'Per-cover fee varies by tier; verify with prospect' },
  resy_pro:   { label: 'Resy Pro',   platform: 'Resy', monthlyBase: 899, perCover: 0, note: 'Per-cover fee varies; verify with prospect' },
  // Yelp: $99-299/mo flat (SlideCostMatrix July 2026)
  yelp_gm: { label: 'Yelp Guest Manager', platform: 'Yelp Guest Manager', monthlyBase: 99, perCover: 0, note: '$99-299/mo range; verify with prospect' },
  // Tock: $199-339/mo + 2-3% prepay fee (SlideCostMatrix July 2026)
  tock_core: { label: 'Tock Core', platform: 'Tock', monthlyBase: 199, perCover: 0, note: '$199-339/mo + 2-3% prepay fee; verify with prospect' },
  // SevenRooms: $499+/mo custom pricing (SlideCostMatrix July 2026)
  sevenrooms: { label: 'SevenRooms', platform: 'SevenRooms', monthlyBase: 499, perCover: 0, note: 'Custom pricing from $499+/mo; verify with prospect' },
  // No platform
  none: { label: 'No platform (phone/paper)', platform: 'None', monthlyBase: 0, perCover: 0 },
} as const

// Legacy alias
export const OT_TIERS = {
  basic: PLATFORM_TIERS.ot_basic,
  core:  PLATFORM_TIERS.ot_core,
  pro:   PLATFORM_TIERS.ot_pro,
} as const
export type OtTierKey = keyof typeof OT_TIERS

export const TABLES_MONTHLY = 199

// Google RwG observed data -- SOURCE='GOOGLE' in TOAST_TABLES_BOOKINGS
// Snowflake query, Q1 2026, 3-month average. N per category: 631-4,135 restaurants.
// Confidence: OBSERVED (do not share methodology with customers)
export const RWG_BY_CATEGORY = {
  fine_dining:   { label: 'Fine Dining',   avgMonthly: 79.4,  avgCheck: 85 },
  fsr_diner:     { label: 'FSR / Diner',   avgMonthly: 96.9,  avgCheck: 55 },
  fsr_general:   { label: 'Casual FSR',    avgMonthly: 73.9,  avgCheck: 50 },
  casual_dining: { label: 'Casual Dining', avgMonthly: 58.5,  avgCheck: 45 },
  bar:           { label: 'Bar / Tavern',  avgMonthly: 34.9,  avgCheck: 35 },
} as const
export type CategoryKey = keyof typeof RWG_BY_CATEGORY

// Toast Local (SOURCE='LOCAL_WEB') -- national average post-Jun 29 redirect
// Confidence: OBSERVED
export const TOAST_LOCAL_MONTHLY_AVG = 10.5

// Email marketing booking lift -- industry benchmark, no internal Snowflake data
// Source: Klaviyo / SevenRooms published benchmarks
// Confidence: ASSUMED
export const EM_LIFT_PCT = 0.15

// Toast Ads CPA range -- directional, no internal ROAS data confirmed
// Confidence: DIRECTIONAL
export const ADS_CPA_LOW = 8
export const ADS_CPA_HIGH = 12

export const ADS_MONTHLY_SPEND_DEFAULT = 500

// SevenRooms "State of Restaurant Reservations" 2023:
// ~9% of OT bookings come through OT's own discovery app
// Confidence: CITED
export const OT_NETWORK_PCT = 0.09

export type ConfidenceLabel = 'OBSERVED' | 'ASSUMED' | 'DIRECTIONAL' | 'CITED'
