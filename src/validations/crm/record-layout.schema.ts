import { z } from 'zod';
import {
  RECORD_LAYOUT_SECTIONS,
  type RecordLayoutEntityType,
} from '@/components/crm/shared/record-layout-sections';

export const recordLayoutEntityTypeSchema = z.enum(['contact', 'company', 'deal']);

export const recordLayoutSectionSchema = z.object({
  key: z.string().trim().min(1),
  visible: z.boolean(),
  order: z.number().int().min(0),
  column: z.enum(['main', 'side']),
});

export const updateRecordLayoutSchema = z
  .object({
    entityType: recordLayoutEntityTypeSchema,
    sections: z.array(recordLayoutSectionSchema).max(50),
  })
  .superRefine((data, ctx) => {
    const allowed = new Set(
      RECORD_LAYOUT_SECTIONS[data.entityType as RecordLayoutEntityType].map((s) => s.key)
    );
    data.sections.forEach((s, i) => {
      if (!allowed.has(s.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sections', i, 'key'],
          message: `Unknown section "${s.key}" for ${data.entityType}`,
        });
      }
    });
  });

export type UpdateRecordLayoutInput = z.infer<typeof updateRecordLayoutSchema>;
