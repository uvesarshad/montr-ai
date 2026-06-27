/**
 * Workflow node: send-sms (subType `send_sms`, audit H16).
 *
 * Sends an SMS over the SAME Twilio (voice) credential + provisioned numbers
 * as outbound calls. The credential/number/plan-gate resolution is delegated to
 * `sendSmsViaProvider`, which mirrors `voice/make-call.ts` exactly:
 *   org from execution → BYOK→brand→org→plan→system selection → voice plan gate
 *   → brand-scoped active sender number (or explicit `from`).
 *
 * This unblocks the "WhatsApp 24h window closed → SMS fallback" pattern: pair
 * this node after a `wait_for_channel_response(channel: whatsapp)` timeout.
 *
 * Inputs (config):
 *   - to: string | template — explicit E.164 destination (overrides contact).
 *   - contactId: string — CRM contact to resolve a phone from (falls back to
 *     the execution's contact, like make-call).
 *   - message / body: string | template — message text.
 *   - from: string — explicit sender number (otherwise picks an active number).
 *   - brandId: string — brand override for credential + number selection.
 *
 * Honors `context.dryRun` (returns `{ simulated: true, wouldSend }`, no send).
 *
 * Outputs: sid (providerMessageId), status, to, from, providerId.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { sendSmsViaProvider } from '../../../voice/sms';

const E164_REGEX = /^\+?[1-9]\d{6,14}$/;

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? 'http://localhost:3000'
  );
}

export class SendSmsProcessor implements NodeProcessor {
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
    if (!asString(config.message) && !asString(config.body)) {
      errors.push('Message body is required');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }

  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution, variableResolver } = context;

    // Org is ALWAYS read from the execution — never client-supplied.
    const userId = execution.userId.toString();
    const brandId = asString(config.brandId);

    // Message body (variable-interpolated when a template string).
    const rawBody = asString(config.message) ?? asString(config.body) ?? '';
    const body = typeof rawBody === 'string'
      ? String(variableResolver.evaluateExpression(rawBody))
      : rawBody;
    if (!body) {
      throw new Error('SMS message body is required');
    }

    // Destination: explicit `to` (variable-interpolated) or resolve from contact
    // (mirrors make-call's contact phone resolution).
    let toNumber = asString(config.to);
    if (typeof config.to === 'string') {
      toNumber = String(variableResolver.evaluateExpression(config.to));
    }

    const contactId = asString(config.contactId) ?? execution.contactId?.toString();
    if (!toNumber && contactId) {
      const contact = await contactRepository.findById(contactId);
      if (!contact) {
        throw new Error(`Contact not found: ${contactId}`);
      }
      toNumber = contact.phone
        ?? contact.channels?.find((c) => c.type === 'phone')?.identifier;
      if (!toNumber) {
        throw new Error(`Contact ${contactId} has no phone number`);
      }
    }

    if (!toNumber || !E164_REGEX.test(toNumber)) {
      throw new Error('SMS requires a valid E.164 destination number');
    }

    const fromOverride = asString(config.from);

    // Dry-run (1.9 test loop): simulate after validation — no provider call.
    if (context.dryRun) {
      return {
        simulated: true,
        sent: false,
        wouldSend: { type: 'sms', to: toNumber, from: fromOverride, body },
        to: toNumber,
      };
    }

    const result = await sendSmsViaProvider({
      userId,
      brandId: brandId ?? null,
      to: toNumber,
      body,
      from: fromOverride,
      webhookBaseUrl: getBaseUrl(),
    });

    return {
      sent: true,
      sid: result.providerMessageId,
      status: result.status,
      to: result.to,
      from: result.from,
      providerId: result.providerId,
    };
  }
}
