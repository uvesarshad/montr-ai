import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * CRM RBAC — org-scoped roles with per-entity object permissions and ownership
 * scopes (modeled after Twenty's Role/ObjectPermission, scoped to CRM).
 */

export type CrmEntity = 'contact' | 'company' | 'deal' | 'activity';
export type CrmScope = 'all' | 'own' | 'none';

export interface ICrmObjectPermission {
  read: CrmScope;
  create: boolean;
  update: CrmScope;
  delete: CrmScope;
  export: boolean;
}

export type ICrmRolePermissions = Record<CrmEntity, ICrmObjectPermission>;

export interface ICrmRole extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: ICrmRolePermissions;
  canManageSettings: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ObjectPermissionSchema = new Schema<ICrmObjectPermission>(
  {
    read: { type: String, enum: ['all', 'own', 'none'], default: 'none' },
    create: { type: Boolean, default: false },
    update: { type: String, enum: ['all', 'own', 'none'], default: 'none' },
    delete: { type: String, enum: ['all', 'own', 'none'], default: 'none' },
    export: { type: Boolean, default: false },
  },
  { _id: false }
);

const CrmRoleSchema = new Schema<ICrmRole>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isSystem: { type: Boolean, default: false },
    permissions: {
      contact: { type: ObjectPermissionSchema, default: () => ({}) },
      company: { type: ObjectPermissionSchema, default: () => ({}) },
      deal: { type: ObjectPermissionSchema, default: () => ({}) },
      activity: { type: ObjectPermissionSchema, default: () => ({}) },
    },
    canManageSettings: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'crm_roles' }
);

CrmRoleSchema.index({ name: 1 }, { unique: true });

if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmRole) {
    delete mongoose.models.CrmRole;
  }
}

const CrmRole: Model<ICrmRole> =
  mongoose.models.CrmRole || mongoose.model<ICrmRole>('CrmRole', CrmRoleSchema);

export default CrmRole;

// ---- Seeded default role definitions ------------------------------------

const ENTITIES: CrmEntity[] = ['contact', 'company', 'deal', 'activity'];

function perm(
  read: CrmScope,
  create: boolean,
  update: CrmScope,
  del: CrmScope,
  exp: boolean
): ICrmObjectPermission {
  return { read, create, update, delete: del, export: exp };
}

function uniformPermissions(p: ICrmObjectPermission): ICrmRolePermissions {
  return ENTITIES.reduce((acc, e) => {
    acc[e] = { ...p };
    return acc;
  }, {} as ICrmRolePermissions);
}

export interface DefaultRoleSeed {
  name: string;
  description: string;
  isSystem: true;
  canManageSettings: boolean;
  permissions: ICrmRolePermissions;
}

export const DEFAULT_CRM_ROLES: DefaultRoleSeed[] = [
  {
    name: 'Admin',
    description: 'Full access to all CRM records and settings.',
    isSystem: true,
    canManageSettings: true,
    permissions: uniformPermissions(perm('all', true, 'all', 'all', true)),
  },
  {
    name: 'Member',
    description: 'Read all records, create and update all, delete own records.',
    isSystem: true,
    canManageSettings: false,
    permissions: uniformPermissions(perm('all', true, 'all', 'own', true)),
  },
  {
    name: 'Read only',
    description: 'Read all records; no create, update, delete or export.',
    isSystem: true,
    canManageSettings: false,
    permissions: uniformPermissions(perm('all', false, 'none', 'none', false)),
  },
];
