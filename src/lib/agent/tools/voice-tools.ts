/**
 * Voice agent tools (B1-2.2).
 *
 * Wraps the voice subsystem APIs. All outbound-call tools are HITL-gated.
 * Contact resolution via X2 before placing any call.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import type { AgentContext } from './types';

// NOTE: initiate_call and bulk_call replicate the /api/v2/voice/calls and
// /api/v2/voice/bulk-calls route orchestration directly (provider selection,
// plan gate, from-number resolution, session/batch creation, dialing) — agent
// tools run server-side (worker + route handlers) where a relative
// fetch('/api/...') has no base URL and no session cookie. The routes contain
// the orchestration inline (no single extractable service fn), so we import the
// same building blocks they use.

/** Webhook base URL for provider callbacks (mirrors bulk-dispatcher.baseUrl). */
function voiceBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? 'http://localhost:3000'
  );
}

const contactRefSchema = z
  .string()
  .describe('Contact ID, phone number (with country code), or email.');

async function resolvePhone(contactRef: string, brandId?: string) {
  const isPhone = /^\+?\d{7,}$/.test(contactRef.replace(/\s/g, ''));
  const isEmail = contactRef.includes('@');

  if (!isPhone && !isEmail) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
    const CrmContact = (await import('@/lib/db/models/crm/contact.model')).default;
    const contact = await CrmContact.findById(contactRef).lean();
    const phone = (contact as { phone?: string })?.phone;
    if (!phone) throw new Error(`Contact ${contactRef} has no phone number`);
    return phone;
  }

  const { resolveContact } = await import('@/lib/identity/resolver');
  const result = await resolveContact({
    brandId,
    phone: isPhone ? contactRef : undefined,
    email: isEmail ? contactRef : undefined,
    createIfMissing: false,
  });
  if (!result.contact) throw new Error(`Cannot resolve contact: ${contactRef}`);
  const phone = (result.contact as { phone?: string }).phone;
  if (!phone) throw new Error('Contact has no phone number');
  return phone;
}

// ─── initiate_call ───────────────────────────────────────────────────────────

const initiateCallParams = z.object({
  contactRef: contactRefSchema,
  purpose: z.enum(['reminder', 'follow_up', 'support', 'pitch', 'other']).optional()
    .describe('Why this call is being placed. The brand\'s voice-call policy may allow some purposes (e.g. reminder) to run without approval.'),
  scriptTemplate: z.string().optional().describe('Optional AI conversation script template name.'),
  maxDurationSec: z.number().optional().describe('Max call duration in seconds. Default: 300.'),
  recordCall: z.boolean().optional().describe('Whether to record the call. Default: true.'),
});

const initiateCallTool = {
  name: 'initiate_call',
  description: 'Place an outbound voice call to a contact. Approval depends on the brand\'s Voice Call Policy (default: always ask). Always state the call purpose.',
  parameters: initiateCallParams,
  factory: (context: AgentContext) => tool({
    description: 'Place an outbound voice call.',
    parameters: initiateCallParams,
    execute: async (args) => {
      try {
        const toNumber = await resolvePhone(args.contactRef, context.brandId);
        const brandId = context.brandId;

        const { initVoiceSubsystem } = await import('@/lib/voice/bootstrap');
        const { getProviderForCall } = await import('@/lib/voice');
        const { callSessionRepository, voicePhoneNumberRepository } = await import('@/lib/db/repository/voice');
        const { checkVoiceGate } = await import('@/lib/voice/plan-gate');
        initVoiceSubsystem();

        const selection = await getProviderForCall({
          userId: context.userId,
          brandId,
        });
        if (!selection) {
          return { success: false, error: 'No voice provider available. Configure a voice provider in admin settings or add a BYOK credential.' };
        }

        const gate = await checkVoiceGate({
          userId: context.userId,
          isByok: selection.source === 'byok',
          providerId: selection.provider.id,
        });
        if (!gate.allowed) {
          return { success: false, error: gate.reason ?? 'Voice not allowed for this plan.' };
        }

        // Resolve a default caller-ID owned by the org/brand for this provider.
        const owned = await voicePhoneNumberRepository.list({
          brandId: brandId ?? null,
          providerId: selection.provider.id,
          status: 'active',
        });
        if (owned.length === 0) {
          return { success: false, error: 'No caller ID available. Provision a phone number first.' };
        }
        const fromNumber = owned[0].phoneNumber;

        const callSession = await callSessionRepository.create({
          brandId: brandId ?? null,
          providerId: selection.provider.id,
          providerConfigId:
            typeof selection.credential.metadata?.configId === 'string'
              ? selection.credential.metadata.configId
              : undefined,
          direction: 'outbound',
          fromNumber,
          toNumber,
          initiatorType: 'user',
          initiatorId: context.userId,
          status: 'queued',
          customMetadata: {
            initiatorUserId: context.userId,
            ...(context.missionId ? { missionId: context.missionId } : {}),
            ...(args.scriptTemplate ? { scriptTemplate: args.scriptTemplate } : {}),
          },
        });

        const callSessionId = callSession._id?.toString();
        if (!callSessionId) {
          return { success: false, error: 'Failed to persist call session.' };
        }

        try {
          const result = await selection.provider.initiateOutboundCall(
            {
              from: fromNumber,
              to: toNumber,
              callSessionId,
              webhookBaseUrl: voiceBaseUrl(),
              // Provider options support recordCall; maxDurationSec isn't a
              // provider-level option (enforced server-side), so it's omitted here.
              options: { recordCall: args.recordCall ?? true },
            },
            selection.credential,
          );
          await callSessionRepository.updateProviderCallId(callSessionId, result.providerCallId);
          await callSessionRepository.updateStatus(callSessionId, {});
          return { success: true, callSessionId, to: toNumber };
        } catch (providerError) {
          const message = providerError instanceof Error ? providerError.message : 'Provider error';
          await callSessionRepository.updateStatus(callSessionId, {
            status: 'failed',
            endReason: 'error',
            errorMessage: message,
            endedAt: new Date(),
          });
          return { success: false, error: `Call initiation failed: ${message}` };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── schedule_call ───────────────────────────────────────────────────────────

const scheduleCallTool = {
  name: 'schedule_call',
  description: 'Schedule a voice call to a contact at a specific time.',
  parameters: z.object({
    contactRef: contactRefSchema,
    scheduledAt: z.string().describe('ISO 8601 datetime for the call.'),
    scriptTemplate: z.string().optional(),
  }),
  factory: (context: AgentContext) => tool({
    description: 'Schedule a voice call for a future time.',
    parameters: z.object({
      contactRef: z.string(),
      scheduledAt: z.string(),
      scriptTemplate: z.string().optional(),
    }),
    execute: async (args) => {
      try {
        const toNumber = await resolvePhone(args.contactRef, context.brandId);
        // Uses agent-scheduled-task for deferred execution.
        const { connectMongoose } = await import('@/lib/mongodb');
        await connectMongoose();
        const AgentScheduledTask = (await import('@/lib/db/models/agent-scheduled-task.model')).default;
        const task = await AgentScheduledTask.create({
          brandId: context.brandId || context.userId,
          userId: context.userId,
          missionId: context.missionId,
          type: 'voice_call',
          scheduledAt: new Date(args.scheduledAt),
          payload: { to: toNumber, scriptTemplate: args.scriptTemplate },
          status: 'pending',
        });
        return { success: true, taskId: task._id.toString(), scheduledAt: args.scheduledAt, to: toNumber };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── get_call_transcript ─────────────────────────────────────────────────────

const getCallTranscriptTool = {
  name: 'get_call_transcript',
  description: 'Retrieve the transcript of a completed voice call.',
  parameters: z.object({
    callSessionId: z.string().describe('The call session ID returned by initiate_call.'),
  }),
  factory: (_context: AgentContext) => tool({
    description: 'Get voice call transcript.',
    parameters: z.object({ callSessionId: z.string() }),
    execute: async (args) => {
      try {
        const response = await fetch(`/api/v2/voice/calls/${args.callSessionId}/transcript`);
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, transcript: data.transcript, summary: data.summary };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── bulk_call ───────────────────────────────────────────────────────────────

const bulkCallParams = z.object({
  contactRefs: z.array(z.string()).describe('Array of contact IDs or phone numbers.'),
  scriptTemplate: z.string().optional().describe('AI script template for the calls.'),
  callsPerMinute: z.number().min(1).max(10).optional().describe('Dial rate throttle. Default: 2.'),
});

const bulkCallTool = {
  name: 'bulk_call',
  description: 'Initiate a bulk voice call campaign to multiple contacts. Always requires approval.',
  parameters: bulkCallParams,
  factory: (context: AgentContext) => tool({
    description: 'Run a bulk outbound call campaign.',
    parameters: bulkCallParams,
    execute: async (args) => {
      try {
        const brandId = context.brandId;

        const { Types } = await import('mongoose');
        const { initVoiceSubsystem } = await import('@/lib/voice/bootstrap');
        const { getProviderForCall } = await import('@/lib/voice');
        const { voicePhoneNumberRepository } = await import('@/lib/db/repository/voice');
        const { checkVoiceGate } = await import('@/lib/voice/plan-gate');
        const { scheduleBulkDispatch } = await import('@/lib/voice/bulk-dispatcher');
        const VoiceBulkBatch = (await import('@/lib/db/models/voice/voice-bulk-batch.model')).default;
        initVoiceSubsystem();

        // Plan gate (bulk dialer uses org/system credentials → isByok: false).
        const gate = await checkVoiceGate({ userId: context.userId, isByok: false });
        if (!gate.allowed) {
          return { success: false, error: gate.reason ?? 'Voice not allowed for this plan.' };
        }

        // Resolve a default from-number (the route requires fromNumber; the tool
        // doesn't supply one, so derive it the same way initiate_call does).
        const selection = await getProviderForCall({ userId: context.userId, brandId });
        if (!selection) {
          return { success: false, error: 'No voice provider available. Configure a voice provider or add a BYOK credential.' };
        }
        const owned = await voicePhoneNumberRepository.list({
          brandId: brandId ?? null,
          providerId: selection.provider.id,
          status: 'active',
        });
        if (owned.length === 0) {
          return { success: false, error: 'No caller ID available. Provision a phone number first.' };
        }
        const fromNumber = owned[0].phoneNumber;

        const e164Regex = /^\+?[1-9]\d{6,14}$/;
        const resolved = await Promise.all(
          args.contactRefs.map(async (ref) => {
            try {
              const phone = await resolvePhone(ref, brandId);
              return e164Regex.test(phone) ? phone : null;
            } catch {
              return null;
            }
          }),
        );
        const validPhones = resolved.filter((p): p is string => Boolean(p));
        if (validPhones.length === 0) {
          return { success: false, error: 'No valid entries — contacts must have E.164 phone numbers.' };
        }

        const batch = await VoiceBulkBatch.create({
          brandId: brandId ? new Types.ObjectId(brandId) : null,
          createdById: new Types.ObjectId(context.userId),
          name: `Agent bulk call ${new Date().toISOString()}`,
          fromNumber,
          script: args.scriptTemplate,
          recordCall: false,
          callsPerMinute: args.callsPerMinute ?? 2,
          status: 'pending',
          entries: validPhones.map((phone) => ({
            contactId: null,
            phoneNumber: phone,
            status: 'pending',
          })),
          totals: {
            total: validPhones.length,
            pending: validPhones.length,
            placing: 0,
            inProgress: 0,
            completed: 0,
            failed: 0,
            noAnswer: 0,
            voicemail: 0,
          },
        });

        const batchId = batch._id?.toString() ?? '';
        scheduleBulkDispatch(batchId);

        return { success: true, batchId, count: validPhones.length };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

toolRegistry.register(initiateCallTool);
toolRegistry.register(scheduleCallTool);
toolRegistry.register(getCallTranscriptTool);
toolRegistry.register(bulkCallTool);
