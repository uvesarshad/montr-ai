import { z } from 'zod';
import { CRM_WIDGET_BY_KEY } from '@/components/crm/dashboard/widget-catalog';

export const crmDashboardWidgetSchema = z.object({
  key: z.string().trim().min(1),
  visible: z.boolean(),
  order: z.number().int().min(0),
});

export const updateCrmDashboardSchema = z
  .object({
    widgets: z.array(crmDashboardWidgetSchema).max(50),
  })
  .superRefine((data, ctx) => {
    data.widgets.forEach((w, i) => {
      if (!CRM_WIDGET_BY_KEY[w.key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['widgets', i, 'key'],
          message: `Unknown widget "${w.key}"`,
        });
      }
    });
  });

export type UpdateCrmDashboardInput = z.infer<typeof updateCrmDashboardSchema>;
