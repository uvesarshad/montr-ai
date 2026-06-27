import { z } from 'zod';

// Channel schema
export const contactChannelSchema = z.object({
  type: z.enum(['email', 'phone', 'whatsapp', 'instagram', 'facebook', 'twitter', 'linkedin']),
  identifier: z.string().min(1),
  isPrimary: z.boolean().default(false),
  verified: z.boolean().default(false),
  lastContactedAt: z.date().optional(),
});

// Multi-value email entry (Twenty-style). Primary mirrors the scalar `email`.
export const contactEmailEntrySchema = z.object({
  value: z.string().email(),
  label: z.enum(['work', 'personal', 'other']).default('work'),
  primary: z.boolean().default(false),
});

// Multi-value phone entry. Primary mirrors `phone`/`phoneNormalized`.
export const contactPhoneEntrySchema = z.object({
  value: z.string().min(1),
  normalized: z.string().optional(),
  label: z.enum(['work', 'mobile', 'home', 'other']).default('mobile'),
  primary: z.boolean().default(false),
});

// Address schema
export const addressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
});

// Social profiles schema
export const socialProfilesSchema = z.object({
  linkedin: z.string().url().optional(),
  twitter: z.string().optional(),
  facebook: z.string().url().optional(),
  instagram: z.string().optional(),
});

// Rich notes schema
export const richNotesSchema = z.object({
  content: z.string().optional(),
  plainText: z.string().optional(),
  updatedAt: z.date().optional(),
  updatedById: z.string().optional(),
});

// Create contact schema
export const createContactSchema = z.object({
  companyId: z.string().optional(),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  emails: z.array(contactEmailEntrySchema).max(10).optional(),
  phones: z.array(contactPhoneEntrySchema).max(10).optional(),
  avatar: z.string().url().optional().or(z.literal('')),
  jobTitle: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  channels: z.array(contactChannelSchema).default([]),
  address: addressSchema.optional(),
  source: z.enum(['manual', 'import', 'form', 'whatsapp', 'website', 'referral', 'email', 'api']).default('manual'),
  sourceDetails: z.record(z.any()).optional(),
  status: z.enum(['lead', 'prospect', 'customer', 'churned', 'inactive']).default('lead'),
  lifecycle: z.enum(['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist']).default('lead'),
  rating: z.enum(['hot', 'warm', 'cold']).default('warm'),
  score: z.number().min(0).max(100).default(0),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.any()).default({}),
  ownerId: z.string().optional(),
  socialProfiles: socialProfilesSchema.optional(),
  marketingConsent: z.boolean().default(false),
  consentTimestamp: z.date().optional(),
  doNotContact: z.boolean().default(false),
  notes: richNotesSchema.optional(),
});

// Update contact schema (all fields optional)
export const updateContactSchema = createContactSchema.partial();

// Contact filter schema
export const contactFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['lead', 'prospect', 'customer', 'churned', 'inactive']).optional(),
  lifecycle: z.enum(['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist']).optional(),
  rating: z.enum(['hot', 'warm', 'cold']).optional(),
  source: z.enum(['manual', 'import', 'form', 'whatsapp', 'website', 'referral', 'email', 'api']).optional(),
  ownerId: z.string().optional(),
  companyId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Bulk operation schemas
export const bulkUpdateContactSchema = z.object({
  ids: z.array(z.string()).min(1),
  updates: updateContactSchema,
});

export const bulkDeleteContactSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export const bulkTagContactSchema = z.object({
  ids: z.array(z.string()).min(1),
  tagIds: z.array(z.string()).min(1),
  action: z.enum(['add', 'remove']),
});

export const mergeContactSchema = z.object({
  sourceId: z.string(),
  targetId: z.string(),
  fieldPreferences: z.record(z.enum(['source', 'target'])).optional(),
});

// Type exports
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ContactFilterInput = z.infer<typeof contactFilterSchema>;
export type BulkUpdateContactInput = z.infer<typeof bulkUpdateContactSchema>;
export type BulkDeleteContactInput = z.infer<typeof bulkDeleteContactSchema>;
export type BulkTagContactInput = z.infer<typeof bulkTagContactSchema>;
export type MergeContactInput = z.infer<typeof mergeContactSchema>;
