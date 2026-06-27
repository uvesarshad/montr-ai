import { z } from 'zod';

// Field option schema (for select/multiselect)
export const fieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  color: z.string().optional(),
});

// Create custom field schema
export const createCustomFieldSchema = z.object({
  entityType: z.enum(['contact', 'company', 'deal']),
  fieldKey: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_]+$/, 'Field key must be alphanumeric with underscores'),
  fieldLabel: z.string().min(1).max(200),
  fieldType: z.enum([
    'text',
    'textarea',
    'number',
    'currency',
    'date',
    'datetime',
    'select',
    'multiselect',
    'checkbox',
    'url',
    'email',
    'phone',
    'user',
    'contact',
    'company',
  ]),
  options: z.array(fieldOptionSchema).optional(),
  required: z.boolean().default(false),
  defaultValue: z.any().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  regex: z.string().optional(),
  order: z.number().default(0),
  showInList: z.boolean().default(false),
  showInCreate: z.boolean().default(true),
  showInFilters: z.boolean().default(false),
  width: z.string().optional(),
  isActive: z.boolean().default(true),
});

// Update custom field schema (all fields optional except cannot change entityType or fieldKey)
export const updateCustomFieldSchema = z.object({
  fieldLabel: z.string().min(1).max(200).optional(),
  fieldType: z.enum([
    'text',
    'textarea',
    'number',
    'currency',
    'date',
    'datetime',
    'select',
    'multiselect',
    'checkbox',
    'url',
    'email',
    'phone',
    'user',
    'contact',
    'company',
  ]).optional(),
  options: z.array(fieldOptionSchema).optional(),
  required: z.boolean().optional(),
  defaultValue: z.any().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  regex: z.string().optional(),
  order: z.number().optional(),
  showInList: z.boolean().optional(),
  showInCreate: z.boolean().optional(),
  showInFilters: z.boolean().optional(),
  width: z.string().optional(),
  isActive: z.boolean().optional(),
});

// Reorder custom fields schema
export const reorderCustomFieldsSchema = z.object({
  fields: z.array(z.object({
    id: z.string(),
    order: z.number(),
  })),
});

// Custom field filter schema
export const customFieldFilterSchema = z.object({
  entityType: z.enum(['contact', 'company', 'deal']).optional(),
  isActive: z.boolean().optional(),
  showInList: z.boolean().optional(),
  showInCreate: z.boolean().optional(),
  showInFilters: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('order'),
});

// Type exports
export type FieldOptionInput = z.infer<typeof fieldOptionSchema>;
export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;
export type ReorderCustomFieldsInput = z.infer<typeof reorderCustomFieldsSchema>;
export type CustomFieldFilterInput = z.infer<typeof customFieldFilterSchema>;
