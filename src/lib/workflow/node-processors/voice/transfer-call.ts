/**
 * Workflow node: transfer-call (voice flow-builder).
 *
 * Transfers a live call (made earlier in the flow by `make_outbound_call`) to a
 * human/agent. Reads the in-progress call from its `callSessionId`, resolves the
 * SAME provider + credential that placed it, and calls the provider's
 * `transferCall` (warm conference or cold redirect).
 *
 * Inputs (config):
 *   - callSessionId: string | template — the call to transfer (e.g.
 *     `{{nodes.makeCall.output.callSessionId}}`).
 *   - to: string | template — E.164 number / SIP URI of the human/agent.
 *   - mode: 'warm' | 'cold' — warm bridges into a conference; cold redirects.
 *   - callerId: string — optional caller ID for the transfer leg.
 *
 * Outputs: { transferStatus, transferCallId?, callSessionId, to, mode }
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { callSessionRepository } from '../../../db/repository/voice';
import { initVoiceSubsystem } from '../../../voice/bootstrap';
import { getProviderForCall } from '../../../voice/selection';

initVoiceSubsystem();

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export class TransferCallProcessor implements NodeProcessor {
  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!asString(config.callSessionId)) {
      errors.push('`callSessionId` is required (e.g. {{nodes.makeCall.output.callSessionId}})');
    }
    if (!asString(config.to)) errors.push('`to` (transfer destination) is required');
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }

  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution, variableResolver } = context;
    const userId = execution.userId.toString();

    let callSessionId = asString(config.callSessionId);
    if (typeof config.callSessionId === 'string') {
      callSessionId = String(variableResolver.evaluateExpression(config.callSessionId));
    }
    if (!callSessionId) throw new Error('transfer_call requires a callSessionId');

    const session = await callSessionRepository.findById(callSessionId);
    if (!session) throw new Error(`Call session not found: ${callSessionId}`);
    if (!session.providerCallId) throw new Error('Call has not connected to a provider yet — nothing to transfer');

    let to = asString(config.to);
    if (typeof config.to === 'string') {
      to = String(variableResolver.evaluateExpression(config.to));
    }
    if (!to) throw new Error('transfer_call requires a destination `to`');

    const mode = asString(config.mode) === 'cold' ? 'cold' : 'warm';
    const callerId = asString(config.callerId);

    const selection = await getProviderForCall({
      userId,
      brandId: session.brandId?.toString() ?? null,
      preferredProviderId: session.providerId,
    });
    if (!selection) throw new Error('No voice provider available to transfer the call');
    if (!selection.provider.transferCall) {
      throw new Error(`Provider "${selection.provider.id}" does not support call transfer`);
    }

    const result = await selection.provider.transferCall(
      { providerCallId: session.providerCallId, to, mode, callerId },
      selection.credential,
    );

    return {
      transferStatus: result.status,
      transferCallId: result.transferCallId,
      callSessionId,
      to,
      mode,
    };
  }
}
