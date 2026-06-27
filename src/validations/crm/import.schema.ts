import { z } from 'zod';

// Create import schema
export const createImportSchema = z.object({
  entityType: z.enum(['contact', 'company']),
  fileName: z.string().min(1),
  fileUrl: z.string().url(),
  fileSize: z.number().min(0),
  fieldMapping: z.record(z.string()), // CSV column -> field mapping
  duplicateHandling: z.enum(['skip', 'update', 'create']).default('skip'),
  duplicateField: z.string().default('email'),
  defaultOwnerId: z.string().optional(),
  defaultTags: z.array(z.string()).default([]),
  createCompanies: z.boolean().default(false),
});

// Update import schema
export const updateImportSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  processedRows: z.number().min(0).optional(),
  successCount: z.number().min(0).optional(),
  errorCount: z.number().min(0).optional(),
  duplicateCount: z.number().min(0).optional(),
});

// Add import error schema
export const addImportErrorSchema = z.object({
  row: z.number().min(0),
  error: z.string().min(1),
  data: z.record(z.any()).optional(),
});

// Import filter schema
export const importFilterSchema = z.object({
  entityType: z.enum(['contact', 'company']).optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  createdById: z.string().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('-createdAt'),
});

// Parse CSV headers schema
export const parseCsvHeadersSchema = z.object({
  fileUrl: z.string().url(),
});

// Validate mapping schema
export const validateMappingSchema = z.object({
  entityType: z.enum(['contact', 'company']),
  fieldMapping: z.record(z.string()),
});

// Type exports
export type CreateImportInput = z.infer<typeof createImportSchema>;
export type UpdateImportInput = z.infer<typeof updateImportSchema>;
export type AddImportErrorInput = z.infer<typeof addImportErrorSchema>;
export type ImportFilterInput = z.infer<typeof importFilterSchema>;
export type ParseCsvHeadersInput = z.infer<typeof parseCsvHeadersSchema>;
export type ValidateMappingInput = z.infer<typeof validateMappingSchema>;
