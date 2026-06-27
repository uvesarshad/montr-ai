/**
 * Gmail send processor (subType `gmail_send`).
 *
 * First-class promotion of the Gmail "send email" capability that previously
 * lived only as a sub-mode of the `google_workspace` dispatcher. Delegates to the
 * shared `gmailSend` service function (single source of truth) so the legacy node
 * and this one stay in lockstep.
 *
 * Auth: OAuth 2.0 access token, resolved the same way as the legacy node —
 *   config.credentialId → workflow credential vault ({ accessToken } / { token })
 *   config.accessToken  → direct bearer
 *
 * Config:
 *   to: string | string[]   — recipients (comma-separated or array) [required]
 *   subject?: string
 *   body / text?: string    — plain-text body (variable-interpolated by engine)
 *   html?: string           — HTML body (takes precedence over text)
 *   cc? / bcc? / from? / replyTo?: string
 *
 * Honors `context.dryRun` → { simulated: true, wouldSend } (no API call).
 * Output: success, messageId, threadId.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { gmailSend } from '@/lib/services/google-workspace.service';

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function resolveToken(context: NodeProcessorContext): string {
  const { config, credentials } = context;
  const credId = asString(config.credentialId);
  const cred = credId && credentials ? credentials[credId] : undefined;
  const token = String(
    (cred && (asString(cred.accessToken) || asString(cred.token))) ||
      asString(config.accessToken) ||
      ''
  ).trim();
  if (!token) throw new Error('Gmail: access token is required (credentialId or accessToken)');
  return token;
}

export class GmailSendProcessor implements NodeProcessor {
  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.to || (Array.isArray(config.to) && config.to.length === 0)) {
      errors.push('to is required');
    }
    if (!asString(config.body) && !asString(config.text) && !asString(config.html)) {
      errors.push('body (or html) is required');
    }
    if (!config.credentialId && !config.accessToken) {
      errors.push('credentialId or accessToken is required');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }

  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;

    const to = config.to;
    const text = asString(config.body) ?? asString(config.text);
    const html = asString(config.html);

    if (context.dryRun) {
      return {
        simulated: true,
        sent: false,
        wouldSend: { type: 'gmail', to, subject: config.subject, hasHtml: !!html },
      };
    }

    const token = resolveToken(context);
    const result = await gmailSend(
      token,
      {
        to,
        subject: config.subject,
        text,
        html,
        cc: config.cc,
        bcc: config.bcc,
        from: config.from,
        replyTo: config.replyTo,
      },
      context.abortSignal
    );

    return { success: true, ...result };
  }
}
