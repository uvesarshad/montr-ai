/**
 * Forms agent tools (B1-2.6).
 *
 * NOTE: create_form calls FormModel directly — agent tools run server-side
 * (worker + route handlers) where a relative fetch('/api/...') has no base URL
 * and no session cookie. Replicates the /api/v2/forms POST creation logic
 * (org-scoped via context.organizationId, creator = context.userId) and
 * additionally materializes the requested fields into the Tiptap form content.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { nanoid } from 'nanoid';
import { toolRegistry } from '../tool-registry';
import type { AgentContext } from './types';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';

/** Map a tool field type to its Tiptap form node type. */
const FIELD_NODE_TYPE: Record<string, string> = {
  text: 'formShortText',
  email: 'formEmail',
  phone: 'formPhone',
  select: 'formDropdown',
  textarea: 'formLongText',
  checkbox: 'formCheckbox',
};

/** Build a Tiptap `doc` JSON string from the tool's field list. */
function buildFormContent(
  name: string,
  description: string | undefined,
  fields: { label: string; type: string; required?: boolean }[],
): string {
  const content: Record<string, unknown>[] = [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: name }] },
  ];
  if (description) {
    content.push({ type: 'paragraph', content: [{ type: 'text', text: description }] });
  }
  for (const field of fields) {
    content.push({
      type: FIELD_NODE_TYPE[field.type] ?? 'formShortText',
      attrs: {
        id: `${field.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${nanoid(4)}`,
        label: field.label,
        required: field.required ?? false,
      },
    });
  }
  return JSON.stringify({ type: 'doc', content });
}

const listSubmissionsParams = z.object({
  formId: z.string(),
  limit: z.number().optional().describe('Max submissions to return. Default: 25.'),
  since: z.string().optional().describe('ISO 8601 datetime — only return submissions after this date.'),
});

const listSubmissionsTool = {
  name: 'list_form_submissions',
  description: 'List submissions for a form.',
  parameters: listSubmissionsParams,
  factory: (context: AgentContext) => tool({
    description: 'List form submissions.',
    parameters: listSubmissionsParams,
    execute: async (args) => {
      try {
        const params = new URLSearchParams({
          limit: String(args.limit ?? 25),
          ...(args.since ? { since: args.since } : {}),
        });
        const response = await fetch(`/api/v2/forms/${args.formId}/submissions?${params}`);
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, submissions: data.data ?? data };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

const createFormParams = z.object({
  name: z.string(),
  fields: z.array(z.object({
    label: z.string(),
    type: z.enum(['text', 'email', 'phone', 'select', 'textarea', 'checkbox']),
    required: z.boolean().optional(),
  })),
  description: z.string().optional(),
});

const createFormTool = {
  name: 'create_form',
  description: 'Create a new form. Always requires approval (schema creation is privileged).',
  parameters: createFormParams,
  factory: (context: AgentContext) => tool({
    description: 'Create a new form.',
    parameters: createFormParams,
    execute: async (args) => {
      try {
        await dbConnect();
        const form = await FormModel.create({
          userId: context.userId,
          ...(context.brandId ? { brandId: context.brandId } : {}),
          title: args.name,
          slug: nanoid(10),
          content: buildFormContent(args.name, args.description, args.fields),
          settings: {
            theme: 'default',
            emailNotifications: false,
            submitButtonText: 'Submit',
            thankYouMessage: 'Thank you for your submission!',
            ...(args.description ? { description: args.description } : {}),
          },
        });
        return { success: true, formId: form._id.toString(), name: args.name };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

toolRegistry.register(listSubmissionsTool);
toolRegistry.register(createFormTool);
