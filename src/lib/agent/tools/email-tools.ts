/**
 * Email agent tools (B1-2.3).
 *
 * Two categories:
 *   1. Inbox (1:1): send/read individual emails via crm_email_accounts
 *   2. Marketing (1:many): schedule/get-metrics for campaigns
 *
 * Campaign-send is always HITL-gated (compliance + cost).
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import type { AgentContext } from './types';
import { emailAccountRepository } from '@/lib/db/repository/crm/email-account.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
// sendEmail is imported lazily inside execute — the email-sync barrel pulls
// the CRM permissions chain (next-auth) which must not load at module scope
// (worker bundles + unit tests import the tool registry without a Next runtime).

// NOTE: send_inbox_email calls the CRM email-send service directly — agent
// tools run server-side (worker + route handlers) where a relative
// fetch('/api/...') has no base URL and no session cookie. Replicates the
// /api/v2/crm/emails/send route: resolve the user's email account + recipient
// (org-scoped via context.organizationId), then call sendEmail().

// ─── send_inbox_email ────────────────────────────────────────────────────────

const sendInboxEmailTool = {
  name: 'send_inbox_email',
  description: 'Send a 1:1 email to a contact from the connected CRM email account. Requires approval.',
  parameters: z.object({
    contactRef: z.string().describe('Contact ID or email address.'),
    subject: z.string(),
    body: z.string().describe('Plain text or HTML email body.'),
    attachments: z.array(z.object({
      name: z.string(),
      url: z.string().url(),
    })).optional(),
  }),
  factory: (context: AgentContext) => tool({
    description: 'Send a 1:1 email via CRM inbox.',
    parameters: z.object({
      contactRef: z.string(),
      subject: z.string(),
      body: z.string(),
      attachments: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
    }),
    execute: async (args) => {
      try {
        // Resolve the recipient: contactRef is either an email or a CRM contact id.
        let toEmail: string;
        let toName: string | undefined;
        if (args.contactRef.includes('@')) {
          toEmail = args.contactRef;
        } else {
          const contact = await contactRepository.findById(args.contactRef);
          if (!contact?.email) {
            return { success: false, error: `Contact ${args.contactRef} has no email address.` };
          }
          toEmail = contact.email;
          toName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || undefined;
        }

        // Resolve a sending account: first active account owned by this user.
        const accounts = await emailAccountRepository.findByUser(context.userId);
        const account = accounts.find((a) => a.isActive) ?? accounts[0];
        if (!account) {
          return {
            success: false,
            error: 'No connected email account found. Ask the user to connect an email account in CRM settings.',
          };
        }

        // Detect HTML vs plain text body (the route forwards both fields; here we
        // pick one based on the body content).
        const isHtml = /<[a-z][\s\S]*>/i.test(args.body);

        const { sendEmail } = await import('@/lib/crm/email-sync');
        const result = await sendEmail(account, {
          to: [{ email: toEmail, name: toName }],
          subject: args.subject,
          bodyHtml: isHtml ? args.body : undefined,
          bodyText: isHtml ? undefined : args.body,
        });

        if (!result.success) {
          return { success: false, error: result.error || 'Failed to send email' };
        }

        const emailId = (result.email as { _id?: { toString(): string } } | undefined)?._id?.toString();
        return { success: true, emailId };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── get_inbox_thread ────────────────────────────────────────────────────────

const getInboxThreadParams = z.object({
  contactRef: z.string().describe('Contact ID or email.'),
  limit: z.number().optional().describe('Max emails to return. Default: 10.'),
});

const getInboxThreadTool = {
  name: 'get_inbox_thread',
  description: 'Retrieve the email thread with a contact.',
  parameters: getInboxThreadParams,
  factory: (context: AgentContext) => tool({
    description: 'Get email thread with a contact.',
    parameters: getInboxThreadParams,
    execute: async (args) => {
      try {
        const params = new URLSearchParams({
          contactRef: args.contactRef,
          limit: String(args.limit ?? 10)
        });
        const response = await fetch(`/api/v2/crm/emails?${params}`);
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, emails: data.data ?? data };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── schedule_campaign ───────────────────────────────────────────────────────

const scheduleCampaignParams = z.object({
  campaignTemplate: z.string().describe('Campaign template name or ID.'),
  audienceFilter: z.string().optional().describe('JSON filter string for audience segmentation.'),
  sendAt: z.string().describe('ISO 8601 datetime to send.'),
  channel: z.enum(['email', 'whatsapp']).optional().describe('Channel. Default: email.'),
});

const scheduleCampaignTool = {
  name: 'schedule_campaign',
  description: 'Schedule a marketing email or WhatsApp campaign. Always requires approval.',
  parameters: scheduleCampaignParams,
  factory: (context: AgentContext) => tool({
    description: 'Schedule a marketing campaign.',
    parameters: scheduleCampaignParams,
    execute: async (args) => {
      try {
        const channel = args.channel ?? 'email';
        const endpoint = channel === 'whatsapp'
          ? '/api/v2/whatsapp/campaigns'
          : '/api/v2/crm/email-campaigns';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId: context.brandId,
            templateId: args.campaignTemplate,
            scheduledAt: args.sendAt,
            audienceFilter: args.audienceFilter ? JSON.parse(args.audienceFilter) : undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, campaignId: data.id ?? data._id, scheduledAt: args.sendAt };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── get_campaign_metrics ────────────────────────────────────────────────────

const getCampaignMetricsParams = z.object({
  campaignId: z.string(),
  channel: z.enum(['email', 'whatsapp']).optional().describe('Channel. Default: email.'),
});

const getCampaignMetricsTool = {
  name: 'get_campaign_metrics',
  description: 'Get performance metrics for a sent email or WhatsApp campaign.',
  parameters: getCampaignMetricsParams,
  factory: (context: AgentContext) => tool({
    description: 'Get campaign performance metrics.',
    parameters: getCampaignMetricsParams,
    execute: async (args) => {
      try {
        const channel = args.channel ?? 'email';
        const endpoint = channel === 'whatsapp'
          ? `/api/v2/whatsapp/campaigns/${args.campaignId}/analytics`
          : `/api/v2/crm/email-campaigns/${args.campaignId}/metrics`;
        const response = await fetch(`${endpoint}?organizationId=${context.userId}`);
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, metrics: data };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

toolRegistry.register(sendInboxEmailTool);
toolRegistry.register(getInboxThreadTool);
toolRegistry.register(scheduleCampaignTool);
toolRegistry.register(getCampaignMetricsTool);
