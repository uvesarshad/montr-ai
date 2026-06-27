/**
 * Workflow node: hangup-call (voice flow-builder).
 *
 * Ends a live call placed earlier in the flow. Resolves the call's provider +
 * credential from its `callSessionId` and calls `provider.hangup`, then marks
 * the session completed.
 *
 * Inputs (config):
 *   - callSessionId: string | template — the call to end (e.g.
 *     `{{nodes.makeCall.output.callSessionId}}`).
 *
 * Outputs: { hungUp, callSessionId }
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { callSessionRepository } from '../../../db/repository/voice';
import { initVoiceSubsystem } from '../../../voice/bootstrap';
import { getProviderForCall } from '../../../voice/selection';

initVoiceSubsystem();

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export class HangupCallProcessor implements NodeProcessor {
  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!asString(config.callSessionId)) {
      errors.push('`callSessionId` is required (e.g. {{nodes.makeCall.output.callSessionId}})');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }

  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution, variableResolver } = context;
    const userId = execution.userId.toString();

    let callSessionId = asString(config.callSessionId);
    if (typeof config.callSessionId === 'string') {
      callSessionId = String(variableResolver.evaluateExpression(config.callSessionId));
    }
    if (!callSessionId) throw new Error('hangup_call requires a callSessionId');

    const session = await callSessionRepository.findById(callSessionId);
    if (!session) throw new Error(`Call session not found: ${callSessionId}`);
    if (!session.providerCallId) {
      // Nothing connected yet — best-effort mark cancelled.
      await callSessionRepository.updateStatus(callSessionId, {
        status: 'cancelled',
        endReason: 'cancelled',
        endedAt: new Date(),
      });
      return { hungUp: false, callSessionId };
    }

    const selection = await getProviderForCall({
      userId,
      brandId: session.brandId?.toString() ?? null,
      preferredProviderId: session.providerId,
    });
    if (!selection) throw new Error('No voice provider available to end the call');

    await selection.provider.hangup(session.providerCallId, selection.credential);
    await callSessionRepository.updateStatus(callSessionId, {
      status: 'completed',
      endReason: 'hangup_by_ai',
      endedAt: new Date(),
    });

    return { hungUp: true, callSessionId };
  }
}
