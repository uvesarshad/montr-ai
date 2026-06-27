/**
 * WhatsApp agent tools (B1-2.1).
 *
 * All tools resolve the target contact via X2 (resolveContact) before acting.
 * Every send action is HITL-gated by default (high broadcast risk).
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import type { AgentContext } from './types';

const contactRefSchema = z
  .string()
  .describe('Contact ID, phone number (with country code), or email to send to.');

/** Resolve contactRef → phone number via WhatsApp account lookup */
async function resolvePhone(
  contactRef: string,
  brandId?: string,
): Promise<string> {
  const { resolveContact } = await import('@/lib/identity/resolver');
  const isPhone = /^\+?\d{7,}$/.test(contactRef.replace(/\s/g, ''));
  const isEmail = contactRef.includes('@');

  if (!isPhone && !isEmail) {
    // Assume it's a contactId — look up the contact directly.
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
    const CrmContact = (await import('@/lib/db/models/crm/contact.model')).default;
    const contact = await CrmContact.findById(contactRef).lean();
    if (!contact) throw new Error(`Contact ${contactRef} not found`);
    const phone = (contact as { phone?: string }).phone;
    if (!phone) throw new Error(`Contact ${contactRef} has no phone number`);
    return phone;
  }

  const result = await resolveContact({
    brandId,
    phone: isPhone ? contactRef : undefined,
    email: isEmail ? contactRef : undefined,
    createIfMissing: false,
  });

  if (!result.contact) throw new Error(`Could not resolve contact for: ${contactRef}`);
  const phone = (result.contact as { phone?: string }).phone;
  if (!phone) throw new Error(`Contact found but has no phone number`);
  return phone;
}

/** Fetch the primary WhatsApp account for the organization */
async function getWhatsAppAccount() {
  const { connectMongoose } = await import('@/lib/mongodb');
  await connectMongoose();
  const WhatsAppAccount = (await import('@/lib/db/models/whatsapp-account.model')).default;
  const account = await WhatsAppAccount.findOne({ isActive: true }).lean();
  if (!account) throw new Error('No active WhatsApp account found for this organization');
  return account;
}

// ─── send_whatsapp_text ──────────────────────────────────────────────────────

const sendWhatsAppTextTool = {
  name: 'send_whatsapp_text',
  description: 'Send a plain text WhatsApp message to a contact. Always requires approval before sending.',
  parameters: z.object({
    contactRef: contactRefSchema,
    message: z.string().describe('Text body of the message.'),
  }),
  factory: (context: AgentContext) => tool({
    description: 'Send a WhatsApp text message.',
    parameters: z.object({ contactRef: z.string(), message: z.string() }),
    execute: async (args) => {
      try {
        const phone = await resolvePhone(args.contactRef, context.brandId);
        const account = await getWhatsAppAccount();
        const { whatsappService } = await import('@/lib/services/whatsapp.service');
        await whatsappService.sendMessage(account as unknown as Parameters<typeof whatsappService.sendMessage>[0], {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: args.message },
        });
        return { success: true, to: phone, message: 'WhatsApp message sent.' };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── send_whatsapp_template ──────────────────────────────────────────────────

const sendWhatsAppTemplateParams = z.object({
  contactRef: contactRefSchema,
  templateName: z.string().describe('Exact name of the approved template.'),
  languageCode: z.string().optional().describe('Template language code. Default: en_US.'),
  vars: z.array(z.string()).optional().describe('Variable values for template placeholders.'),
});

const sendWhatsAppTemplateTool = {
  name: 'send_whatsapp_template',
  description: 'Send a pre-approved WhatsApp template message. Always requires approval.',
  parameters: sendWhatsAppTemplateParams,
  factory: (context: AgentContext) => tool({
    description: 'Send a WhatsApp template message.',
    parameters: sendWhatsAppTemplateParams,
    execute: async (args) => {
      try {
        const phone = await resolvePhone(args.contactRef, context.brandId);
        const account = await getWhatsAppAccount();
        const { whatsappService } = await import('@/lib/services/whatsapp.service');
        const components = args.vars?.length
          ? [{ type: 'body', parameters: args.vars.map(v => ({ type: 'text', text: v })) }]
          : undefined;
        await whatsappService.sendMessage(account as unknown as Parameters<typeof whatsappService.sendMessage>[0], {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: args.templateName,
            language: { code: args.languageCode ?? 'en_US' },
            components,
          },
        });
        return { success: true, to: phone, template: args.templateName };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── send_whatsapp_image ──────────────────────────────────────────────────────

const sendWhatsAppImageTool = {
  name: 'send_whatsapp_image',
  description: 'Send an image via WhatsApp. Requires approval.',
  parameters: z.object({
    contactRef: contactRefSchema,
    imageUrl: z.string().url().describe('Publicly accessible image URL.'),
    caption: z.string().optional().describe('Optional caption.'),
  }),
  factory: (context: AgentContext) => tool({
    description: 'Send a WhatsApp image.',
    parameters: z.object({
      contactRef: z.string(),
      imageUrl: z.string(),
      caption: z.string().optional(),
    }),
    execute: async (args) => {
      try {
        const phone = await resolvePhone(args.contactRef, context.brandId);
        const account = await getWhatsAppAccount();
        const { whatsappService } = await import('@/lib/services/whatsapp.service');
        await whatsappService.sendMessage(account as unknown as Parameters<typeof whatsappService.sendMessage>[0], {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'image',
          ...(({ imageUrl: link, caption } = args) => ({ image: { link, caption } }))(),
        } as Parameters<typeof whatsappService.sendMessage>[1]);
        return { success: true, to: phone };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── send_whatsapp_buttons ───────────────────────────────────────────────────

const sendWhatsAppButtonsTool = {
  name: 'send_whatsapp_buttons',
  description: 'Send a WhatsApp interactive button message. Requires approval.',
  parameters: z.object({
    contactRef: contactRefSchema,
    bodyText: z.string().describe('Message body.'),
    buttons: z.array(z.object({
      id: z.string(),
      title: z.string().max(20),
    })).max(3).describe('Up to 3 reply buttons.'),
    headerText: z.string().optional(),
    footerText: z.string().optional(),
  }),
  factory: (context: AgentContext) => tool({
    description: 'Send a WhatsApp interactive button message.',
    parameters: z.object({
      contactRef: z.string(),
      bodyText: z.string(),
      buttons: z.array(z.object({ id: z.string(), title: z.string() })),
      headerText: z.string().optional(),
      footerText: z.string().optional(),
    }),
    execute: async (args) => {
      try {
        const phone = await resolvePhone(args.contactRef, context.brandId);
        const account = await getWhatsAppAccount();
        const { whatsappService } = await import('@/lib/services/whatsapp.service');
        const payload = {
          messaging_product: 'whatsapp' as const,
          to: phone,
          type: 'interactive' as const,
          interactive: {
            type: 'button',
            ...(args.headerText ? { header: { type: 'text', text: args.headerText } } : {}),
            body: { text: args.bodyText },
            ...(args.footerText ? { footer: { text: args.footerText } } : {}),
            action: {
              buttons: args.buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
            },
          },
        };
        await whatsappService.sendMessage(
          account as unknown as Parameters<typeof whatsappService.sendMessage>[0],
          payload as unknown as Parameters<typeof whatsappService.sendMessage>[1],
        );
        return { success: true, to: phone };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// Register all WhatsApp tools with HITL gating via ALWAYS_REQUIRE_APPROVAL list.
toolRegistry.register(sendWhatsAppTextTool);
toolRegistry.register(sendWhatsAppTemplateTool);
toolRegistry.register(sendWhatsAppImageTool);
toolRegistry.register(sendWhatsAppButtonsTool);
