/**
 * Send WhatsApp Interactive Message Processors (2.11)
 *
 * Implements the Bundle-3 stub subtypes `send_whatsapp_buttons` and
 * `send_whatsapp_list` (previously NotImplemented). Interactive messages are
 * SESSION messages — they require an open 24-hour conversation window, so both
 * processors hard-block through the shared compliance-gate before sending.
 *
 *   buttons → Graph API interactive type 'button' (up to 3 reply buttons)
 *   list    → Graph API interactive type 'list' (a menu button + sections/rows)
 *
 * Account resolution goes through the shared resolve-account helper (org from
 * execution); the outbound call goes through whatsappService.sendInteractiveMessage.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import {
  whatsappService,
  type WhatsAppInteractive,
  type WhatsAppInteractiveButton,
  type WhatsAppInteractiveListSection,
} from '../../../services/whatsapp.service';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { resolveWhatsAppAccount } from './resolve-account';
import { assertConversationWindowOpen } from './compliance-gate';

const MAX_REPLY_BUTTONS = 3;

interface ButtonRow {
  id?: string;
  title?: string;
}

interface ListRow {
  id?: string;
  title?: string;
  description?: string;
}

interface ListSection {
  title?: string;
  rows?: ListRow[];
}

/**
 * Build the Graph API `interactive` object from node config.
 * @throws on validation failures (empty body, no buttons/rows, too many buttons).
 */
function buildInteractive(config: Record<string, unknown>): WhatsAppInteractive {
  const mode = config.mode === 'list' ? 'list' : 'buttons';
  const bodyText = String(config.bodyText || config.body || '').trim();
  if (!bodyText) {
    throw new Error('Interactive message body text is required');
  }

  const headerText = String(config.headerText || '').trim();
  const footerText = String(config.footerText || '').trim();

  const base = {
    body: { text: bodyText },
    ...(headerText ? { header: { type: 'text' as const, text: headerText } } : {}),
    ...(footerText ? { footer: { text: footerText } } : {}),
  };

  if (mode === 'buttons') {
    const rows = (Array.isArray(config.buttons) ? config.buttons : []) as ButtonRow[];
    const buttons: WhatsAppInteractiveButton[] = rows
      .map((r, i) => ({
        id: String(r.id ?? `btn_${i}`),
        title: String(r.title ?? '').trim(),
      }))
      .filter((r) => r.title)
      .slice(0, MAX_REPLY_BUTTONS)
      .map((r) => ({ type: 'reply' as const, reply: { id: r.id, title: r.title } }));

    if (buttons.length === 0) {
      throw new Error('At least one reply button (with a title) is required');
    }
    return { type: 'button', ...base, action: { buttons } };
  }

  // list mode
  const buttonLabel = String(config.buttonLabel || config.listButton || 'Choose').trim();
  const rawSections = (Array.isArray(config.sections) ? config.sections : []) as ListSection[];
  const sections: WhatsAppInteractiveListSection[] = rawSections
    .map((s) => ({
      ...(s.title ? { title: String(s.title) } : {}),
      rows: (Array.isArray(s.rows) ? s.rows : [])
        .map((row, i) => ({
          id: String(row.id ?? `row_${i}`),
          title: String(row.title ?? '').trim(),
          ...(row.description ? { description: String(row.description) } : {}),
        }))
        .filter((row) => row.title),
    }))
    .filter((s) => s.rows.length > 0);

  if (sections.length === 0) {
    throw new Error('A list message requires at least one section with one row');
  }
  return { type: 'list', ...base, action: { button: buttonLabel, sections } };
}

class SendWhatsAppInteractiveBase implements NodeProcessor {
  protected mode: 'buttons' | 'list';

  constructor(mode: 'buttons' | 'list') {
    this.mode = mode;
  }

  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    // Force the mode so a node mounted as buttons/list always sends that kind.
    const interactive = buildInteractive({ ...config, mode: this.mode });

    // Resolve WhatsApp account (brand-aware, org from execution).
    const { account } = await resolveWhatsAppAccount(context);

    if (!execution.contactId) {
      throw new Error('Contact ID is required for WhatsApp messages');
    }

    const contact = await contactRepository.findById(
      execution.contactId.toString()
    );
    if (!contact) {
      throw new Error(`Contact not found: ${execution.contactId}`);
    }

    const whatsappChannel = contact.channels?.find((c) => c.type === 'whatsapp');
    if (!whatsappChannel) {
      throw new Error(`Contact ${execution.contactId} has no WhatsApp channel`);
    }

    // Compliance: interactive messages are session messages — require an open
    // 24-hour conversation window (hard-block), same as free-form text/media.
    const compliance = await assertConversationWindowOpen(
      execution.contactId.toString(),
      whatsappChannel.identifier,
    );

    // Dry-run (1.9): simulate after compliance passes — no API call.
    if (context.dryRun) {
      return {
        simulated: true,
        sent: false,
        wouldSend: { type: 'interactive', mode: this.mode, to: whatsappChannel.identifier, interactive },
        recipientId: whatsappChannel.identifier,
        accountId: account._id?.toString(),
        compliance,
      };
    }

    const result = await whatsappService.sendInteractiveMessage(
      account,
      whatsappChannel.identifier,
      interactive,
    );

    return {
      sent: true,
      mode: this.mode,
      messageId: result.messages?.[0]?.id,
      recipientId: whatsappChannel.identifier,
      accountId: account._id?.toString(),
      compliance,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    try {
      buildInteractive({ ...config, mode: this.mode });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Invalid interactive message config');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}

export class SendWhatsAppButtonsProcessor extends SendWhatsAppInteractiveBase {
  constructor() {
    super('buttons');
  }
}

export class SendWhatsAppListProcessor extends SendWhatsAppInteractiveBase {
  constructor() {
    super('list');
  }
}
