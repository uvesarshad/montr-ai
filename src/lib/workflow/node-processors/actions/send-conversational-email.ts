/**
 * Conversational email processor — 1:1 personalised email send.
 *
 * Unlike the marketing-email processor, this one does not require a saved
 * template or provider record. It sends a single transactional email using:
 *   1. A MarketingProvider record (preferred — uses stored credentials), OR
 *   2. Inline SMTP credentials from the workflow credential map, OR
 *   3. Inline SMTP credentials directly in config (post variable resolution).
 *
 * Config:
 *   providerId?: string        — MarketingProvider._id to send through
 *   credentialId?: string      — workflow credential map key holding SMTP creds
 *   to: string | string[]      — required recipient(s)
 *   cc?: string | string[]
 *   bcc?: string | string[]
 *   fromEmail?: string         — overrides provider default
 *   fromName?: string
 *   replyTo?: string
 *   subject: string            — required
 *   body: string               — required (HTML or text)
 *   contentType?: 'html'|'text' — default 'html'
 *   smtp?: { host, port, username, password, secure? } — inline fallback
 */

import { NodeProcessor, NodeProcessorContext } from '../index';

function toRecipientArray(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

export class SendConversationalEmailProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials, execution } = context;

    const to = toRecipientArray(config.to);
    if (!to || to.length === 0) {
      throw new Error('Conversational email: "to" is required');
    }

    const subject = String(config.subject ?? '').trim();
    if (!subject) throw new Error('Conversational email: "subject" is required');

    const body = String(config.body ?? '');
    if (!body.trim()) throw new Error('Conversational email: "body" is required');

    const contentType: 'html' | 'text' =
      config.contentType === 'text' ? 'text' : 'html';

    const { ProviderFactory } = await import(
      '../../../marketing-email/providers/provider-factory'
    );

    // Resolve provider:
    //   1) saved MarketingProvider via providerId
    //   2) inline SMTP from credentials map
    //   3) inline SMTP from config.smtp
    let providerInstance: { send: (payload: Record<string, unknown>) => Promise<{ messageId?: string }> };
    let fromEmail: string | undefined = config.fromEmail as string | undefined;
    let fromName: string | undefined = config.fromName as string | undefined;
    let replyTo: string | undefined = config.replyTo as string | undefined;

    if (config.providerId) {
      const MarketingProvider = (
        await import('@/lib/db/models/marketing-email/provider.model')
      ).default;
      const provider = await MarketingProvider.findOne({
        _id: config.providerId
      });
      if (!provider) {
        throw new Error(`Conversational email: provider not found (${config.providerId})`);
      }
      providerInstance = ProviderFactory.create(provider) as unknown as typeof providerInstance;
      fromEmail = fromEmail || (provider.fromEmail as string | undefined);
      fromName = fromName || (provider.fromName as string | undefined);
      replyTo = replyTo || (provider.replyToEmail as string | undefined);
    } else {
      // Inline SMTP path
      const credBlob = (
        (config.credentialId && credentials?.[config.credentialId as string]) ||
        config.smtp
      ) as Record<string, unknown> | undefined;
      if (!credBlob) {
        throw new Error(
          'Conversational email: either providerId or inline SMTP credentials are required'
        );
      }
      const { SMTPProvider } = await import(
        '../../../marketing-email/providers/smtp-provider'
      );
      if (!credBlob.host || !credBlob.port || !credBlob.username || !credBlob.password) {
        throw new Error(
          'Conversational email: SMTP credential must include host, port, username, password'
        );
      }
      providerInstance = new SMTPProvider({
        host: credBlob.host as string,
        port: Number(credBlob.port),
        username: credBlob.username as string,
        password: credBlob.password as string,
        secure: !!credBlob.secure,
      }) as unknown as typeof providerInstance;
      fromEmail = fromEmail || (credBlob.fromEmail as string | undefined) || (credBlob.username as string | undefined);
      fromName = fromName || (credBlob.fromName as string | undefined);
    }

    if (!fromEmail) {
      throw new Error('Conversational email: fromEmail is required');
    }

    const sendPayload: Record<string, unknown> = {
      to: to.length === 1 ? to[0] : to,
      subject,
      fromEmail,
      fromName,
      replyTo,
      tags: ['conversational-email', 'workflow'],
      metadata: {
        workflowId: execution.workflowId?.toString?.() ?? String(execution.workflowId),
        executionId: execution._id?.toString?.() ?? String(execution._id),
      },
    };
    if (contentType === 'html') {
      sendPayload.html = body;
    } else {
      sendPayload.text = body;
    }
    const cc = toRecipientArray(config.cc);
    if (cc) sendPayload.cc = cc;
    const bcc = toRecipientArray(config.bcc);
    if (bcc) sendPayload.bcc = bcc;

    const result = await providerInstance.send(sendPayload);

    return {
      success: true,
      messageId: result.messageId,
      to,
      subject,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.to) errors.push('to is required');
    if (!config.subject) errors.push('subject is required');
    if (!config.body) errors.push('body is required');
    if (!config.providerId && !config.credentialId && !config.smtp) {
      errors.push('Either providerId, credentialId, or inline smtp config is required');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
