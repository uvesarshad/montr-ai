/**
 * Zod schemas for voice phone number API requests.
 */

import { z } from 'zod';

import { phoneNumberSchema } from './call.schema';

const routingTypeEnum = z.enum([
  'workflow',
  'ai_bot',
  'human_queue',
  'forward',
  'voicemail',
  'disabled',
]);

export const inboundRoutingSchema = z.object({
  type: routingTypeEnum,
  targetId: z.string().max(200).optional(),
  greetingAudioUrl: z.string().url().optional(),
  maxRingSeconds: z.number().int().min(5).max(120).optional(),
  fallback: z
    .object({
      type: routingTypeEnum,
      targetId: z.string().max(200).optional(),
    })
    .optional(),
});

export const provisionNumberSchema = z.object({
  providerId: z.enum(['twilio', 'plivo', 'telnyx', 'in-house']),
  countryCode: z.string().length(2),
  /** Either supply a specific number or area-code prefix. */
  phoneNumber: phoneNumberSchema.optional(),
  areaCode: z.string().regex(/^[0-9]{3}$/).optional(),
  friendlyName: z.string().max(100).optional(),
  capabilities: z.array(z.enum(['voice', 'sms', 'mms', 'fax'])).optional(),
  brandId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  inboundRouting: inboundRoutingSchema.optional(),
});

export type ProvisionNumberInput = z.infer<typeof provisionNumberSchema>;
export type InboundRoutingInput = z.infer<typeof inboundRoutingSchema>;
