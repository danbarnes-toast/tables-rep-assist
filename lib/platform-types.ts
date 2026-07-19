export interface RepContext {
  rep_name: string;
  team: string;
  region: string;
  language?: string;
}

export interface ProductHealth {
  product: string;
  status: 'live_healthy' | 'live_stalled' | 'live_at_risk' | 'purchased_not_activated' | 'not_purchased';
  purchased_date?: string;
  last_activity_date?: string;
  notes?: string;
}

export interface AccountContext {
  name: string;
  city: string;
  state: string;
  activation_status: string;
  current_booking_platform?: string;
  bookings_90d: number;
  covers_90d?: number;
  monthly_trend?: { month: string; bookings: number; covers: number }[];
  chorus_calls?: { call_date: string; summary: string; action_items: string }[];
  is_activated?: boolean;
  signed_date?: string;
  products?: ProductHealth[];
  days_since_touchpoint?: number;
  days_since_rep_contact?: number;
  open_support_tickets?: number;
  case_data?: {
    case_count_90d: number;
    open_cases: number;
    escalated_cases: number;
    days_since_last_case: number;
    top_case_category: string;
    case_subjects: string[];
  };
  flare_signals?: string[];
  account_grade?: string;
  total_arr?: number;
  renewal_date?: string;
  account_health?: 'healthy' | 'at_risk' | 'cancel_risk';
  locations?: number;
}