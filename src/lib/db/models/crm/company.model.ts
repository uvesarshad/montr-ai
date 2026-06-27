import mongoose, { Schema, Document, Model, Types } from 'mongoose';

// Reuse interfaces from contact model
export interface ICompanyAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface ICompanySocialProfiles {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
}

export interface ICompanyRichNotes {
  content?: string;
  plainText?: string;
  updatedAt?: Date;
  updatedById?: Types.ObjectId | string;
}

export interface ICrmCompany extends Document {
  // Basic Information
  name: string;
  domain?: string;
  website?: string;
  logo?: string;
  description?: string;

  // Business Details
  industry?: string;
  type: 'prospect' | 'customer' | 'partner' | 'vendor' | 'competitor';
  size?: '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1000+';
  annualRevenue?: number;
  employeeCount?: number;

  // Address
  address?: ICompanyAddress;

  // Contact Information
  phone?: string;
  email?: string;

  // Social Profiles
  socialProfiles?: ICompanySocialProfiles;

  // Categorization
  tags: Types.ObjectId[];
  customFields: Record<string, unknown>;

  // Assignment
  ownerId?: Types.ObjectId;
  assignedAt?: Date;

  // Metrics (denormalized)
  contactCount: number;
  dealCount: number;
  totalDealValue: number;
  wonDealValue: number;
  lastActivityAt?: Date;
  totalActivities: number;

  // Rich Notes
  notes?: ICompanyRichNotes;

  // Soft delete (trash & restore)
  deletedAt?: Date;
  deletedById?: Types.ObjectId;

  // Metadata
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CompanyAddressSchema = new Schema({
  street: String,
  city: String,
  state: String,
  country: String,
  postalCode: String,
}, { _id: false });

const CompanySocialProfilesSchema = new Schema({
  linkedin: String,
  twitter: String,
  facebook: String,
  instagram: String,
}, { _id: false });

const CompanyRichNotesSchema = new Schema({
  content: String,
  plainText: String,
  updatedAt: Date,
  updatedById: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
}, { _id: false });

const CrmCompanySchema = new Schema<ICrmCompany>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    domain: {
      type: String,
      lowercase: true,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
    },
    description: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['prospect', 'customer', 'partner', 'vendor', 'competitor'],
      default: 'prospect',
    },
    size: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
    },
    annualRevenue: {
      type: Number,
    },
    employeeCount: {
      type: Number,
    },
    address: {
      type: CompanyAddressSchema,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    socialProfiles: {
      type: CompanySocialProfilesSchema,
    },
    tags: [{
      type: Schema.Types.ObjectId,
      ref: 'CrmTag',
    }],
    customFields: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedAt: {
      type: Date,
    },
    contactCount: {
      type: Number,
      default: 0,
    },
    dealCount: {
      type: Number,
      default: 0,
    },
    totalDealValue: {
      type: Number,
      default: 0,
    },
    wonDealValue: {
      type: Number,
      default: 0,
    },
    lastActivityAt: {
      type: Date,
    },
    totalActivities: {
      type: Number,
      default: 0,
    },
    notes: {
      type: CompanyRichNotesSchema,
    },
    deletedAt: {
      type: Date,
      default: undefined,
    },
    deletedById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_companies',
  }
);

// Org-scoped trash queries — only indexes soft-deleted rows.
CrmCompanySchema.index(
  { deletedAt: 1 },
  { partialFilterExpression: { deletedAt: { $exists: true } } }
);

// Indexes
CrmCompanySchema.index({ name: 1 });
CrmCompanySchema.index({ domain: 1 }, { sparse: true });
CrmCompanySchema.index({ type: 1, ownerId: 1 });
CrmCompanySchema.index({ tags: 1 });
CrmCompanySchema.index({ createdAt: -1 });
CrmCompanySchema.index({ lastActivityAt: -1 });

// Text index for search
CrmCompanySchema.index(
  { name: 'text', domain: 'text', description: 'text', 'notes.plainText': 'text' },
  { name: 'company_text_search' }
);

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmCompany) {
    delete mongoose.models.CrmCompany;
  }
}

const CrmCompany: Model<ICrmCompany> =
  mongoose.models.CrmCompany || mongoose.model<ICrmCompany>('CrmCompany', CrmCompanySchema);

export default CrmCompany;
