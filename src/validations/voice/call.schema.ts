/**
 * Zod schemas for voice call API requests.
 */

import { z } from 'zod';

const e164Regex = /^\+?[1-9]\d{6,14}$/;

export const phoneNumberSchema = z
  .string()
  .trim()
  .regex(e164Regex, 'Phone number must be E.164 (e.g. +14155551234)');

export const initiateCallSchema = z.object({
  to: phoneNumberSchema,
  from: phoneNumberSchema.optional(),
  fromContactId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  brandId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  /** Workflow run that initiated the call (engine-side; not user-supplied). */
  workflowRunId: z.string().optional(),
  /** AI bot to attach to the call once answered. */
  aiBotId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  /** AiCharacter to use for voice + personality + style (B2-3.13). */
  aiCharacterId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  options: z
    .object({
      machineDetection: z.boolean().optional(),
      recordCall: z.boolean().optional(),
      timeoutSec: z.number().int().min(5).max(120).optional(),
      maxDurationSec: z.number().int().min(10).max(60 * 60).optional(),
    })
    .partial()
    .optional(),
});

export type InitiateCallInput = z.infer<typeof initiateCallSchema>;

export const playAudioSchema = z.object({
  audioUrl: z.string().url(),
  loop: z.number().int().min(1).max(10).optional(),
});

export const sendDtmfSchema = z.object({
  digits: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[0-9*#w]+$/, 'DTMF digits must be 0-9, *, #, or w (pause)'),
});

export const dispositionSchema = z.object({
  outcome: z.enum(['connected', 'voicemail', 'no_answer', 'busy', 'failed', 'declined']),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  category: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});
