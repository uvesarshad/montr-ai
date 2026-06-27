import { z } from 'zod';

export const crmScopeSchema = z.enum(['all', 'own', 'none']);

export const crmObjectPermissionSchema = z.object({
  read: crmScopeSchema,
  create: z.boolean(),
  update: crmScopeSchema,
  delete: crmScopeSchema,
  export: z.boolean(),
});

export const crmRolePermissionsSchema = z.object({
  contact: crmObjectPermissionSchema,
  company: crmObjectPermissionSchema,
  deal: crmObjectPermissionSchema,
  activity: crmObjectPermissionSchema,
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  permissions: crmRolePermissionsSchema,
  canManageSettings: z.boolean().default(false),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  permissions: crmRolePermissionsSchema.optional(),
  canManageSettings: z.boolean().optional(),
});

export const assignRoleSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1).nullable(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
