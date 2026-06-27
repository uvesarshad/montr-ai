/**
 * Identity agent tools (B1-2.11).
 *
 * Explicit X2 wrapper. Agents MUST call resolve_contact before any
 * "send to <contact>" action to guard against hallucinated identifiers.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import type { AgentContext } from './types';

const resolveContactParams = z.object({
  phone: z.string().optional().describe('Phone number with country code.'),
  email: z.string().optional().describe('Email address.'),
  socialHandle: z.string().optional().describe('@handle for social platforms.'),
  platform: z.string().optional().describe('Social platform name (instagram, twitter, linkedin…).'),
  createIfMissing: z.boolean().optional().describe('Create a new contact if no match found. Default: false.'),
});

const resolveContactTool = {
  name: 'resolve_contact',
  description: 'Find a CRM contact by phone, email, or social handle. Always call this before sending messages to ensure the right person is targeted.',
  parameters: resolveContactParams,
  factory: (context: AgentContext) => tool({
    description: 'Resolve a person to their CRM contact.',
    parameters: resolveContactParams,
    execute: async (args) => {
      try {
        const { resolveContact } = await import('@/lib/identity/resolver');
        const socialHandles = args.socialHandle && args.platform
          ? { [args.platform as string]: args.socialHandle }
          : undefined;
        const result = await resolveContact({
          brandId: context.brandId,
          phone: args.phone,
          email: args.email,
          socialHandles: socialHandles as Parameters<typeof resolveContact>[0]['socialHandles'],
          createIfMissing: args.createIfMissing ?? false,
          createdById: context.userId,
        });
        if (!result.contact) {
          return { found: false, message: 'No matching contact found.' };
        }
        const c = result.contact as { _id?: { toString(): string }; firstName?: string; lastName?: string; email?: string; phone?: string };
        return {
          found: true,
          contactId: c._id?.toString(),
          name: [c.firstName, c.lastName].filter(Boolean).join(' '),
          email: c.email,
          phone: c.phone,
          matchedBy: result.matchedBy,
          created: result.created,
        };
      } catch (error) {
        return { found: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

const mergeContactsTool = {
  name: 'merge_contacts',
  description: 'Merge duplicate contacts into one. Always requires approval.',
  parameters: z.object({
    survivorId: z.string().describe('Contact ID to keep.'),
    loserIds: z.array(z.string()).describe('Contact IDs to merge into the survivor.'),
  }),
  factory: (context: AgentContext) => tool({
    description: 'Merge duplicate CRM contacts.',
    parameters: z.object({ survivorId: z.string(), loserIds: z.array(z.string()) }),
    execute: async (args) => {
      try {
        const { mergeContacts } = await import('@/lib/identity/resolver');
        await mergeContacts({ keepId: args.survivorId, mergeIds: args.loserIds, performedById: context.userId });
        return { success: true, survivorId: args.survivorId, merged: args.loserIds };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

const findContactParams = z.object({
  attribute: z.enum(['email', 'phone', 'name', 'company', 'jobTitle']),
  value: z.string(),
  limit: z.number().optional().describe('Max results. Default: 10.'),
});

const findContactByAttributeTool = {
  name: 'find_contact_by_attribute',
  description: 'Search for contacts by a specific attribute value.',
  parameters: findContactParams,
  factory: (context: AgentContext) => tool({
    description: 'Search CRM contacts by attribute.',
    parameters: findContactParams,
    execute: async (args) => {
      try {
        const { contactRepository } = await import('@/lib/db/repository/crm/contact.repository');
        const result = await contactRepository.find({
          search: args.value,
        }, { limit: args.limit ?? 10 });
        return {
          success: true,
          contacts: result.data.map((c: {
            _id?: { toString(): string };
            firstName?: string;
            lastName?: string;
            email?: string;
            phone?: string;
          }) => ({
            id: c._id?.toString(),
            name: [c.firstName, c.lastName].filter(Boolean).join(' '),
            email: c.email,
            phone: c.phone,
          })),
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

toolRegistry.register(resolveContactTool);
toolRegistry.register(mergeContactsTool);
toolRegistry.register(findContactByAttributeTool);
