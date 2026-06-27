/**
 * lookup_contact — find a CRM contact by phone, email, or name during a call.
 *
 * Lets the in-call agent identify the caller / look up an account mid-turn.
 * 🔒 Org-scoped: the organizationId comes from the BotToolContext (resolved from
 * the call session, never the model/caller). Returns a compact, speakable
 * summary — not the raw record — to keep TTS output short.
 */

import { z } from 'zod';

import { contactRepository } from '@/lib/db/repository/crm/contact.repository';

import type { BotTool } from '@/lib/ai-bots/tools/types';

const params = z.object({
  phone: z.string().min(3).optional().describe('Phone number to look the caller up by.'),
  email: z.string().email().optional().describe('Email address to look the contact up by.'),
  name: z.string().min(2).optional().describe('Full or partial name to search for.'),
});

type LookupArgs = z.infer<typeof params>;

interface LookupResult {
  found: boolean;
  summary: string;
}

function summarize(contact: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  lifecycle?: string | null;
  status?: string | null;
}): string {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unnamed contact';
  const bits: string[] = [name];
  if (contact.company) bits.push(`at ${contact.company}`);
  if (contact.lifecycle) bits.push(`lifecycle: ${contact.lifecycle}`);
  if (contact.status) bits.push(`status: ${contact.status}`);
  if (contact.email) bits.push(`email: ${contact.email}`);
  return bits.join(', ');
}

export const lookupContactTool: BotTool<LookupArgs, LookupResult> = {
  name: 'lookup_contact',
  description:
    "Look up a CRM contact by phone, email, or name to identify the caller or pull their account details mid-call. Provide at least one of phone, email, or name.",
  parameters: params,
  execute: async (ctx, args) => {
    let contact = null as Awaited<ReturnType<typeof contactRepository.findByPhone>> | null;
    if (args.phone) {
      contact = await contactRepository.findByPhone(args.phone);
    }
    if (!contact && args.email) {
      contact = await contactRepository.findByEmail(args.email);
    }
    if (!contact && args.name) {
      const page = await contactRepository.find({ search: args.name }, { limit: 1 });
      contact = page.data[0] ?? null;
    }

    if (!contact) {
      return { found: false, summary: 'No matching contact found.' };
    }

    const c = contact as unknown as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      company?: string;
      lifecycle?: string;
      status?: string;
    };
    return { found: true, summary: summarize(c) };
  },
};
