/**
 * createCrmActivity — let the bot log a note/task against the resolved contact.
 *
 * Limited to 'note' and 'task' types — message rows are handled by the
 * channel layer (whatsapp_messages / inbox_messages), not by the bot.
 */

import { z } from 'zod';

import { ActivityRepository } from '@/lib/db/repository/crm/activity.repository';

import type { BotTool } from './types';

const activityRepo = new ActivityRepository();

const params = z.object({
  type: z.enum(['note', 'task']).describe('Activity type.'),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).describe('Activity body. Plain text or simple markdown.'),
  dueDate: z.string().datetime().optional().describe('ISO timestamp; only for type=task.'),
});

export const createCrmActivityTool: BotTool<
  z.infer<typeof params>,
  { activityId: string } | { error: string }
> = {
  name: 'createCrmActivity',
  description:
    'Log a CRM note or task against the current contact. Use to record a follow-up, capture an insight from the conversation, or schedule a task for a human.',
  parameters: params,
  execute: async (ctx, args) => {
    if (!ctx.contactId) {
      return { error: 'No contact linked to this conversation; cannot log activity.' };
    }
    try {
      const activity = await activityRepo.create({
        type: args.type,
        targetType: 'contact',
        targetId: ctx.contactId,
        contactId: ctx.contactId,
        subject: args.subject,
        body: args.body,
        bodyPlain: args.body,
        dueDate: args.dueDate ? new Date(args.dueDate) : undefined,
        createdById: ctx.aiBotId,
      });
      return { activityId: String(activity._id) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
};
