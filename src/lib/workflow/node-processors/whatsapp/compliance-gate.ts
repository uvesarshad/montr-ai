/**
 * Compliance gates for WhatsApp workflow sends (H21).
 *
 * Workflow sends previously bypassed `src/lib/whatsapp/compliance.ts` entirely.
 * These helpers wrap that same API (matching the campaign/manual-send paths)
 * but HARD-BLOCK on failure with actionable error text instead of recording a
 * warning — a workflow that violates Meta's rules should fail loudly.
 */

import {
  isConversationWindowOpen,
  isTemplateApproved,
  isMarketingTemplate,
  hasMarketingConsent,
  hasDoNotContact,
} from '../../../whatsapp/compliance';
import type { ICrmContact } from '../../../db/models/crm/contact.model';
import type { IWhatsAppTemplate } from '../../../db/models/whatsapp-template.model';

export interface ComplianceResult {
  windowOpen?: boolean;
  templateApproved?: boolean;
  marketingConsent?: boolean;
  doNotContact?: boolean;
}

/**
 * Free-form (non-template) sends — text, media outside a template — require an
 * open 24-hour conversation window per Meta rules.
 */
export async function assertConversationWindowOpen(
  contactId: string,
  recipient: string,
): Promise<ComplianceResult> {
  const windowOpen = await isConversationWindowOpen(contactId);
  if (!windowOpen) {
    throw new Error(
      `Cannot send free-form WhatsApp message: the 24-hour conversation window with ${recipient} is closed — use an approved template instead.`,
    );
  }
  return { windowOpen: true };
}

/**
 * Template sends — the template must be approved, and MARKETING-category
 * templates additionally require marketing consent and respect the
 * do-not-contact flag.
 */
export function assertTemplateCompliant(
  template: IWhatsAppTemplate,
  contact: ICrmContact,
): ComplianceResult {
  if (!isTemplateApproved(template)) {
    throw new Error(
      `Template '${template.name}' is not approved (status: ${template.status}) — submit it for approval before sending.`,
    );
  }

  const result: ComplianceResult = { templateApproved: true };

  if (isMarketingTemplate(template)) {
    const doNotContact = hasDoNotContact(contact);
    if (doNotContact) {
      throw new Error('Contact is on the do-not-contact list.');
    }
    const marketingConsent = hasMarketingConsent(contact);
    if (!marketingConsent) {
      throw new Error('Contact has not opted in to marketing messages.');
    }
    result.marketingConsent = true;
    result.doNotContact = false;
  }

  return result;
}
