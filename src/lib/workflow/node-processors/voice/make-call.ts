/**
 * Workflow node: make-outbound-call (V-6.3).
 *
 * Inputs (config):
 *   - contactId: string | template — target contact in CRM.
 *   - to: string | template — explicit E.164 destination (overrides contactId).
 *   - from: string — explicit caller ID (otherwise picks an active owned number).
 *   - aiBotId: string — AI bot to attach once answered (Phase 5 hook).
 *   - maxDurationSec: number — engine should not pause longer than this.
 *   - waitForCompletion: boolean — when true, the node throws
 *     `ExecutionPausedForCall` to suspend the run until `call.completed` lands
 *     on this contact. When false, returns immediately after initiation.
 *
 * Outputs:
 *   - callSessionId, providerCallId, status, providerId
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import {
  callSessionRepository,
  voicePhoneNumberRepository,
} from '../../../db/repository/voice';
import { initVoiceSubsystem } from '../../../voice/bootstrap';
import { getProviderForCall } from '../../../voice/selection';
import { checkVoiceGate } from '../../../voice/plan-gate';

initVoiceSubsystem();

const E164_REGEX = /^\+?[1-9]\d{6,14}$/;

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Accept real booleans or the builder's 'true'/'false' string selects. */
function asBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 'yes' || v === 'on';
}

/** Accept numbers or numeric strings from builder inputs. */
function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? 'http://localhost:3000'
  );
}

export class MakeOutboundCallProcessor implements NodeProcessor {
  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const to = asString(config.to);
    const contactId = asString(config.contactId);
    if (!to && !contactId) {
      errors.push('Either `to` (E.164 number) or `contactId` is required');
    }
    if (to && !E164_REGEX.test(to)) {
      errors.push('`to` must be a valid E.164 number (e.g. +14155551234)');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }

  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution, variableResolver } = context;
    const userId = execution.userId.toString();
    const brandId = asString(config.brandId);

    let toNumber = asString(config.to);
    if (typeof config.to === 'string') {
      toNumber = String(variableResolver.evaluateExpression(config.to));
    }

    const contactId = asString(config.contactId) ?? execution.contactId?.toString();
    let fromContactId: string | undefined = contactId;

    if (!toNumber && contactId) {
      const contact = await contactRepository.findById(contactId);
      if (!contact) {
        throw new Error(`Contact not found: ${contactId}`);
      }
      toNumber = contact.phone ?? contact.channels?.find((c) => c.type === 'phone')?.identifier;
      if (!toNumber) {
        throw new Error(`Contact ${contactId} has no phone number`);
      }
      fromContactId = contactId;
    }

    if (!toNumber || !E164_REGEX.test(toNumber)) {
      throw new Error('Outbound call requires a valid E.164 destination number');
    }

    const selection = await getProviderForCall({
      userId,
      brandId: brandId ?? null,
    });
    if (!selection) {
      throw new Error(
        'No voice provider available — configure one in admin settings or BYOK',
      );
    }

    // Plan-tier gate. BYOK bypasses minute caps (Q1.3).
    const gate = await checkVoiceGate({
      userId,
      isByok: selection.source === 'byok',
      providerId: selection.provider.id,
    });
    if (!gate.allowed) {
      throw new Error(gate.reason ?? 'Voice not allowed on current plan');
    }

    let fromNumber = asString(config.from);
    if (!fromNumber) {
      const owned = await voicePhoneNumberRepository.list({
        brandId: brandId ?? null,
        providerId: selection.provider.id,
        status: 'active',
      });
      if (owned.length === 0) {
        throw new Error(
          'No caller ID available — provision a phone number first or set `from`',
        );
      }
      fromNumber = owned[0].phoneNumber;
    }

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
      fromContactId,
      initiatorType: 'workflow',
      initiatorId: execution._id?.toString(),
      workflowRunId: execution._id?.toString(),
      status: 'queued',
      customMetadata: {
        aiBotId: asString(config.aiBotId),
        workflowNodeId: context.node.id,
      },
    });

    const callSessionId = callSession._id?.toString();
    if (!callSessionId) {
      throw new Error('Failed to persist call session');
    }

    try {
      const result = await selection.provider.initiateOutboundCall(
        {
          from: fromNumber,
          to: toNumber,
          callSessionId,
          webhookBaseUrl: getBaseUrl(),
          options: {
            recordCall: asBool(config.recordCall),
            machineDetection: asBool(config.machineDetection),
            timeoutSec: asNumber(config.timeoutSec),
          },
        },
        selection.credential,
      );
      await callSessionRepository.updateProviderCallId(callSessionId, result.providerCallId);

      return {
        callSessionId,
        providerCallId: result.providerCallId,
        status: result.status,
        providerId: selection.provider.id,
        from: fromNumber,
        to: toNumber,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Provider error';
      await callSessionRepository.updateStatus(callSessionId, {
        status: 'failed',
        endReason: 'error',
        errorMessage: message,
        endedAt: new Date(),
      });
      throw new Error(`Outbound call failed: ${message}`);
    }
  }
}
