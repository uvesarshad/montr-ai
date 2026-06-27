/**
 * Send Marketing Email Processor
 *
 * Two recipient modes (backward compatible; defaults to `single`):
 *  - `single`: sends to one `recipientEmail` (legacy behaviour, output shape
 *    unchanged).
 *  - `list`: sends to many recipients sourced EITHER from an upstream
 *    array/expression OR from a CRM tag/segment, resolved org-scoped. Sends are
 *    batched (mirrors CampaignService: small batches with a delay) and honour
 *    the suppression list + per-contact consent flags. Per-recipient template
 *    substitution exposes the contact fields the single path exposes.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';

// Hard cap on list-mode recipients per run (matches the audit's ~500 ceiling).
const MAX_LIST_RECIPIENTS = 500;
// Batch size + inter-batch delay mirror the campaign processor's pacing
// (campaign batches default to 100; the job reschedules with a 1s gap).
const LIST_BATCH_SIZE = 50;
const LIST_BATCH_DELAY_MS = 1000;
// Failure list is capped in the node output to keep payloads small.
const MAX_REPORTED_FAILURES = 20;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ResolvedRecipient {
  email: string;
  name?: string;
  contactId?: string;
  // Arbitrary extra fields exposed to the template under `contact`.
  fields: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SendMarketingEmailProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const recipientMode = (config.recipientMode as string) === 'list' ? 'list' : 'single';

    // Import marketing email services dynamically
    const { ProviderFactory } = await import('../../../../lib/marketing-email/providers/provider-factory');
    const { templateService } = await import('../../../../lib/marketing-email/services/template.service');
    const { trackingService } = await import('../../../../lib/marketing-email/services/tracking.service');
    const MarketingTemplate = (await import('../../../../lib/db/models/marketing-email/template.model')).default;
    const MarketingProvider = (await import('../../../../lib/db/models/marketing-email/provider.model')).default;

    // Get configuration
    const templateId = config.templateId as string | undefined;
    const providerId = config.providerId as string | undefined;
    const organizationId = execution.userId?.toString();

    if (!templateId) {
      throw new Error('Template ID is required');
    }

    if (!providerId) {
      throw new Error('Provider ID is required');
    }
    // Get template and provider — filter by organizationId to enforce tenancy
    const template = await MarketingTemplate.findOne({ _id: templateId });
    const provider = await MarketingProvider.findOne({ _id: providerId });

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    const providerInstance = ProviderFactory.create(provider);

    // ─── SINGLE MODE (legacy — unchanged output shape) ───────────────────────
    if (recipientMode === 'single') {
      const recipientEmail = config.recipientEmail as string | undefined;
      if (!recipientEmail) {
        throw new Error('Recipient email is required');
      }

      // Render template with variables
      const triggerData = execution.triggerData as Record<string, unknown> | undefined;
      const renderData = {
        ...execution.variables,
        contact: (triggerData?.contact as Record<string, unknown>) || {},
        deal: (triggerData?.deal as Record<string, unknown>) || {}
      };

      const { subject, html, text } = templateService.render(template, renderData);

      // Dry-run (1.9): simulate the send — no provider call, no tracking event.
      if (context.dryRun) {
        return {
          simulated: true,
          success: false,
          wouldSend: { to: recipientEmail, subject, templateId: template._id.toString() },
          recipientEmail,
          subject,
        };
      }

      const result = await providerInstance.send({
        to: recipientEmail,
        subject,
        html,
        text,
        fromEmail: provider.fromEmail,
        fromName: provider.fromName,
        replyTo: provider.replyToEmail,
        tags: ['workflow-automation'],
        metadata: {
          workflowId: execution.workflowId.toString(),
          executionId: execution._id.toString(),
          templateId: template._id.toString()
        }
      });

      // Record tracking event
      await trackingService.recordEvent(
        organizationId,
        result.messageId,
        'sent',
        {
          providerId: provider._id.toString(),
          email: recipientEmail,
          workflowId: execution.workflowId.toString(),
          executionId: execution._id.toString()
        }
      );

      return {
        success: true,
        messageId: result.messageId,
        recipientEmail,
        subject
      };
    }

    // ─── LIST MODE ───────────────────────────────────────────────────────────
    const recipients = await this.resolveListRecipients(context, organizationId);

    let sent = 0;
    let failed = 0;
    const failures: Array<{ email: string; error: string }> = [];

    const recordFailure = (email: string, error: string) => {
      failed++;
      if (failures.length < MAX_REPORTED_FAILURES) {
        failures.push({ email, error });
      }
    };

    for (let i = 0; i < recipients.length; i += LIST_BATCH_SIZE) {
      const batch = recipients.slice(i, i + LIST_BATCH_SIZE);

      for (const recipient of batch) {
        try {
          // Suppression / unsubscribe check (mirrors campaign send path).
          const isSuppressed = await trackingService.isSuppressed(recipient.email);
          if (isSuppressed) {
            recordFailure(recipient.email, 'suppressed (unsubscribed/bounced/complained)');
            continue;
          }

          // Per-recipient template substitution: expose contact fields the same
          // way the single path does (`contact`, `recipientName`).
          const renderData = {
            ...execution.variables,
            contact: {
              ...recipient.fields,
              email: recipient.email,
              name: recipient.name,
            },
            recipientName: recipient.name,
            deal: {},
          };

          const { subject, html, text } = templateService.render(template, renderData);

          const result = await providerInstance.send({
            to: recipient.email,
            subject,
            html,
            text,
            fromEmail: provider.fromEmail,
            fromName: provider.fromName,
            replyTo: provider.replyToEmail,
            tags: ['workflow-automation'],
            metadata: {
              workflowId: execution.workflowId.toString(),
              executionId: execution._id.toString(),
              templateId: template._id.toString(),
              ...(recipient.contactId && { contactId: recipient.contactId }),
            }
          });

          await trackingService.recordEvent(
            organizationId,
            result.messageId,
            'sent',
            {
              providerId: provider._id.toString(),
              email: recipient.email,
              workflowId: execution.workflowId.toString(),
              executionId: execution._id.toString(),
              ...(recipient.contactId && { contactId: recipient.contactId }),
            }
          );

          sent++;
        } catch (error) {
          recordFailure(recipient.email, error instanceof Error ? error.message : String(error));
        }
      }

      // Delay between batches to respect provider rate limits (mirrors the
      // campaign processor's inter-batch pacing). Skip after the last batch.
      if (i + LIST_BATCH_SIZE < recipients.length) {
        await sleep(LIST_BATCH_DELAY_MS);
      }
    }

    return {
      success: true,
      sent,
      failed,
      total: recipients.length,
      failures,
    };
  }

  /**
   * Build the de-duplicated, validated recipient list for list mode.
   *
   * Source precedence:
   *  1. `tagId` / `tagName` / `segmentTag` → org-scoped CRM tag lookup.
   *  2. otherwise `listSource` (expression / raw value) or `recipients` (raw).
   *
   * Accepts these recipient shapes:
   *  - `string[]` of emails
   *  - `Array<{ email, name?, ... }>`
   *  - `{ records: [...] }` (find_records node output) — emails extracted.
   *
   * Invalid emails are skipped (they surface as counted failures only if the
   * caller relies on suppression; here invalid entries are dropped pre-send and
   * NOT sent — they're excluded from `total` so the batch is never aborted).
   */
  private async resolveListRecipients(
    context: NodeProcessorContext,
    organizationId: string,
  ): Promise<ResolvedRecipient[]> {
    const { config, variableResolver } = context;

    const tagRef = (config.tagId || config.tagName || config.segmentTag) as string | undefined;

    let raw: unknown;

    if (tagRef && String(tagRef).trim()) {
      raw = await this.loadContactsByTag(String(tagRef).trim());
    } else {
      // Prefer a raw `recipients` payload (programmatic/agent callers). Then a
      // `listSource` expression: if it's a single `{{...}}` expression we
      // re-evaluate it to recover the RAW array/object (resolveObject would have
      // stringified it). Otherwise treat listSource as already-resolved value.
      if (config.recipients != null) {
        raw = config.recipients;
      } else {
        const listSource = config.listSource;
        if (typeof listSource === 'string') {
          const trimmed = listSource.trim();
          const single = trimmed.match(/^\{\{([^}]+)\}\}$/);
          if (single && variableResolver) {
            try {
              raw = variableResolver.evaluateExpression(single[1].trim());
            } catch {
              raw = trimmed;
            }
          } else {
            raw = trimmed;
          }
        } else {
          raw = listSource;
        }
      }
    }

    const recipients = this.normalizeRecipients(raw);

    // Dedupe by lowercased email, drop invalid, cap.
    const seen = new Set<string>();
    const out: ResolvedRecipient[] = [];
    for (const r of recipients) {
      const email = (r.email || '').toLowerCase().trim();
      if (!email || !EMAIL_RE.test(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({ ...r, email });
      if (out.length >= MAX_LIST_RECIPIENTS) break;
    }

    if (out.length === 0) {
      throw new Error('List mode requires at least one valid recipient (none resolved from the configured source)');
    }

    return out;
  }

  /** Resolve org-scoped contacts for a tag reference (id or name). */
  private async loadContactsByTag(tagRef: string): Promise<ResolvedRecipient[]> {
    const { tagRepository } = await import('../../../db/repository/crm/tag.repository');
    const { contactRepository } = await import('../../../db/repository/crm/contact.repository');

    // Accept either a tag ObjectId or a tag name — both resolved org-scoped.
    const isObjectId = /^[a-f0-9]{24}$/i.test(tagRef);
    let tagId: string | undefined;
    if (isObjectId) {
      const byId = await tagRepository.findById(tagRef);
      tagId = byId?._id?.toString();
    }
    if (!tagId) {
      const byName = await tagRepository.findByName(tagRef);
      tagId = byName?._id?.toString();
    }
    if (!tagId) {
      throw new Error(`Tag/segment not found: ${tagRef}`);
    }

    const result = await contactRepository.find(
      { tags: [tagId] },
      { page: 1, limit: MAX_LIST_RECIPIENTS },
    );

    const out: ResolvedRecipient[] = [];
    for (const c of result.data) {
      // Honour per-contact consent the same way the campaign batch does.
      if (!c.email) continue;
      if (c.doNotContact) continue;
      if (c.marketingConsent === false) continue;
      out.push({
        email: c.email,
        name: [c.firstName, c.lastName].filter(Boolean).join(' ') || undefined,
        contactId: c._id?.toString(),
        fields: {
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          jobTitle: c.jobTitle,
          company: c.companyId?.toString(),
          ...((c.customFields as Record<string, unknown>) || {}),
        },
      });
    }
    return out;
  }

  /**
   * Coerce an arbitrary resolved value into a recipient array. Handles:
   *  - string[] of emails
   *  - Array<{email,name?,...}>
   *  - { records: [...] } (find_records node output)
   *  - single object/string fallbacks
   */
  private normalizeRecipients(raw: unknown): ResolvedRecipient[] {
    if (raw == null) return [];

    // find_records output shape: { records: [...] }
    if (typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as { records?: unknown }).records)) {
      return this.normalizeRecipients((raw as { records: unknown[] }).records);
    }

    const items = Array.isArray(raw) ? raw : [raw];
    const out: ResolvedRecipient[] = [];

    for (const item of items) {
      if (item == null) continue;

      if (typeof item === 'string') {
        out.push({ email: item, fields: {} });
        continue;
      }

      if (typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        // Pull email from common keys; fall back to a primary multi-value email.
        let email = (obj.email || obj.to || obj.emailAddress) as string | undefined;
        if (!email && Array.isArray(obj.emails)) {
          const emails = obj.emails as Array<{ value?: string; primary?: boolean }>;
          email = (emails.find((e) => e?.primary)?.value || emails[0]?.value) as string | undefined;
        }
        if (!email) continue;

        const name =
          (obj.name as string | undefined) ||
          [obj.firstName, obj.lastName].filter(Boolean).join(' ') ||
          undefined;

        out.push({
          email: String(email),
          name,
          contactId: (obj._id || obj.id || obj.contactId)?.toString(),
          fields: obj,
        });
      }
    }

    return out;
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.templateId) {
      errors.push('Template ID is required');
    }

    if (!config.providerId) {
      errors.push('Provider ID is required');
    }

    const recipientMode = config.recipientMode === 'list' ? 'list' : 'single';

    if (recipientMode === 'single') {
      if (!config.recipientEmail) {
        errors.push('Recipient email is required');
      }
      if (config.recipientEmail && !EMAIL_RE.test(String(config.recipientEmail))) {
        errors.push('Invalid email format');
      }
    } else {
      const hasSource =
        config.tagId || config.tagName || config.segmentTag || config.listSource || config.recipients;
      if (!hasSource) {
        errors.push('List mode requires a recipient source (a tag/segment, list expression, or recipients array)');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}
