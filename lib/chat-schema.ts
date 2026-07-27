import { z } from 'zod';

const ChorusCallSchema = z.object({
  call_date: z.string().max(20),
  summary: z.string().max(8000),
  action_items: z.string().max(4000),
});

const ProductHealthSchema = z.object({
  product: z.string().max(100),
  status: z.string().max(50),
  notes: z.string().max(500).optional(),
});

export const AccountContextSchema = z.object({
  name: z.string().max(200),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  toast_guid: z.string().max(100).optional(),
  salesforce_account_id: z.string().max(100).optional(),
  signed_date: z.string().max(20).optional(),
  activation_status: z.string().max(50).optional(),
  is_activated: z.boolean().optional(),
  bookings_90d: z.number().int().min(0).optional(),
  covers_90d: z.number().int().min(0).optional(),
  current_booking_platform: z.string().max(100).optional(),
  chorus_calls: z.array(ChorusCallSchema).max(10).optional(),
  products: z.array(ProductHealthSchema).max(20).optional(),
  days_since_touchpoint: z.number().int().min(0).optional(),
  open_support_tickets: z.number().int().min(0).optional(),
  total_arr: z.number().min(0).optional(),
  account_health: z.enum(['healthy', 'at_risk', 'cancel_risk']).optional(),
  locations: z.number().int().min(1).optional(),
}).strict();

export const RepContextSchema = z.object({
  rep_name: z.string().max(100),
  team: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
}).strict();

export const RuntimeContextSchema = z.record(z.string().max(50), z.string().max(500));

export const ChatBodySchema = z.object({
  messages: z.array(z.any()).max(100).optional(),
  language: z.string().max(10).optional(),
  repContext: RepContextSchema.optional(),
  accountContext: AccountContextSchema.optional(),
  runtime: RuntimeContextSchema.optional(),
});
