import { z } from 'zod';
import { addressSchema, socialProfilesSchema, richNotesSchema } from './contact.schema';

// Create company schema
export const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(200),
  domain: z.string().max(200).optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  logo: z.string().url().optional().or(z.literal('')),
  description: z.string().max(2000).optional(),
  industry: z.string().max(200).optional(),
  type: z.enum(['prospect', 'customer', 'partner', 'vendor', 'competitor']).default('prospect'),
  size: z.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']).optional(),
  annualRevenue: z.number().min(0).optional(),
  employeeCount: z.number().min(0).optional(),
  address: addressSchema.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  socialProfiles: socialProfilesSchema.optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.any()).default({}),
  ownerId: z.string().optional(),
  notes: richNotesSchema.optional(),
});

// Update company schema (all fields optional)
export const updateCompanySchema = createCompanySchema.partial();

// Company filter schema
export const companyFilterSchema = z.object({
  search: z.string().optional(),
  type: z.enum(['prospect', 'customer', 'partner', 'vendor', 'competitor']).optional(),
  industry: z.string().optional(),
  size: z.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']).optional(),
  ownerId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  minRevenue: z.number().optional(),
  maxRevenue: z.number().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Bulk operation schemas
export const bulkUpdateCompanySchema = z.object({
  ids: z.array(z.string()).min(1),
  updates: updateCompanySchema,
});

export const bulkDeleteCompanySchema = z.object({
  ids: z.array(z.string()).min(1),
});

export const bulkTagCompanySchema = z.object({
  ids: z.array(z.string()).min(1),
  tagIds: z.array(z.string()).min(1),
  action: z.enum(['add', 'remove']),
});

// Type exports
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CompanyFilterInput = z.infer<typeof companyFilterSchema>;
export type BulkUpdateCompanyInput = z.infer<typeof bulkUpdateCompanySchema>;
export type BulkDeleteCompanyInput = z.infer<typeof bulkDeleteCompanySchema>;
export type BulkTagCompanyInput = z.infer<typeof bulkTagCompanySchema>;
