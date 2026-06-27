import mongoose, { Schema, Document, Model, Types } from 'mongoose';

// Channel types for Omnichat integration
export interface IContactChannel {
  type: 'email' | 'phone' | 'whatsapp' | 'instagram' | 'facebook' | 'twitter' | 'linkedin';
  identifier: string;
  isPrimary: boolean;
  verified: boolean;
  lastContactedAt?: Date;
}

// Multi-value email (Twenty-style). The PRIMARY entry mirrors the scalar `email`.
export interface IContactEmail {
  value: string;
  label: 'work' | 'personal' | 'other';
  primary: boolean;
}

// Multi-value phone. The PRIMARY entry mirrors `phone` / `phoneNormalized`.
export interface IContactPhone {
  value: string;
  normalized?: string;
  label: 'work' | 'mobile' | 'home' | 'other';
  primary: boolean;
}

// Address structure
export interface IAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

// Social profiles
export interface ISocialProfiles {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
}

// Rich notes (TipTap content)
export interface IRichNotes {
  content?: string; // TipTap JSON content
  plainText?: string; // Plain text for search
  updatedAt?: Date;
  updatedById?: Types.ObjectId | string;
}

// Source details
export interface ISourceDetails {
  [key: string]: unknown;
}

export interface ICrmContact extends Document {
  /**
   * Agency-mode brand scope. Nullable so existing rows load cleanly; new
   * channel ingest paths (form, inbox, WhatsApp) set this from the resolver
   * context. Backfill assigns org's default brand to historical rows.
   */
  brandId?: Types.ObjectId | null;
  companyId?: Types.ObjectId;

  // Personal Information
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  /**
   * Digits-only canonical form of `phone`, auto-populated on save by the pre-save hook.
   * Used by the identity resolver (src/lib/identity/resolver.ts) for cross-channel
   * contact matching. Sparse-indexed per organization.
   */
  phoneNormalized?: string;
  /**
   * Multi-value emails (Twenty-style). The entry flagged `primary` is mirrored
   * to the scalar `email` field; sync is centralized in the repository layer
   * via `normalizeContactIdentityFields` (src/lib/crm/contact-identity.ts).
   */
  emails: IContactEmail[];
  /** Multi-value phones; primary mirrors `phone`/`phoneNormalized`. */
  phones: IContactPhone[];
  avatar?: string;
  jobTitle?: string;
  department?: string;

  // Communication Channels (for Omnichat)
  channels: IContactChannel[];

  // Address
  address?: IAddress;

  // CRM Fields
  source: 'manual' | 'import' | 'form' | 'whatsapp' | 'website' | 'referral' | 'email' | 'api' | 'ads';
  sourceDetails?: ISourceDetails;
  status: 'lead' | 'prospect' | 'customer' | 'churned' | 'inactive';
  lifecycle: 'subscriber' | 'lead' | 'mql' | 'sql' | 'opportunity' | 'customer' | 'evangelist';
  rating: 'hot' | 'warm' | 'cold';
  score: number;

  // Categorization
  tags: Types.ObjectId[];
  customFields: Record<string, unknown>;

  // Assignment & Ownership
  ownerId?: Types.ObjectId;
  assignedAt?: Date;

  // Engagement Tracking
  lastActivityAt?: Date;
  lastContactedAt?: Date;
  lastEmailAt?: Date;
  lastCalendarEventAt?: Date;
  totalActivities: number;
  totalEmails: number;

  // Social Profiles
  socialProfiles?: ISocialProfiles;

  // Consent & Compliance
  marketingConsent: boolean;
  consentTimestamp?: Date;
  doNotContact: boolean;

  // Rich Notes
  notes?: IRichNotes;

  // Soft delete (trash & restore)
  deletedAt?: Date;
  deletedById?: Types.ObjectId;

  // Metadata
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ContactChannelSchema = new Schema({
  type: {
    type: String,
    enum: ['email', 'phone', 'whatsapp', 'instagram', 'facebook', 'twitter', 'linkedin'],
    required: true,
  },
  identifier: {
    type: String,
    required: true,
  },
  isPrimary: {
    type: Boolean,
    default: false,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  lastContactedAt: {
    type: Date,
  },
}, { _id: false });

const ContactEmailSchema = new Schema({
  value: { type: String, required: true, lowercase: true, trim: true },
  label: { type: String, enum: ['work', 'personal', 'other'], default: 'work' },
  primary: { type: Boolean, default: false },
}, { _id: false });

const ContactPhoneSchema = new Schema({
  value: { type: String, required: true, trim: true },
  normalized: { type: String, trim: true },
  label: { type: String, enum: ['work', 'mobile', 'home', 'other'], default: 'mobile' },
  primary: { type: Boolean, default: false },
}, { _id: false });

const AddressSchema = new Schema({
  street: String,
  city: String,
  state: String,
  country: String,
  postalCode: String,
}, { _id: false });

const SocialProfilesSchema = new Schema({
  linkedin: String,
  twitter: String,
  facebook: String,
  instagram: String,
}, { _id: false });

const RichNotesSchema = new Schema({
  content: String,
  plainText: String,
  updatedAt: Date,
  updatedById: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
}, { _id: false });

const CrmContactSchema = new Schema<ICrmContact>(
  {
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
      index: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmCompany',
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    phoneNormalized: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    emails: {
      type: [ContactEmailSchema],
      default: [],
    },
    phones: {
      type: [ContactPhoneSchema],
      default: [],
    },
    avatar: {
      type: String,
    },
    jobTitle: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    channels: {
      type: [ContactChannelSchema],
      default: [],
    },
    address: {
      type: AddressSchema,
    },
    source: {
      type: String,
      enum: ['manual', 'import', 'form', 'whatsapp', 'website', 'referral', 'email', 'api', 'ads'],
      default: 'manual',
    },
    sourceDetails: {
      type: Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: ['lead', 'prospect', 'customer', 'churned', 'inactive'],
      default: 'lead',
    },
    lifecycle: {
      type: String,
      enum: ['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist'],
      default: 'lead',
    },
    rating: {
      type: String,
      enum: ['hot', 'warm', 'cold'],
      default: 'warm',
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
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
    lastActivityAt: {
      type: Date,
    },
    lastContactedAt: {
      type: Date,
    },
    lastEmailAt: {
      type: Date,
    },
    lastCalendarEventAt: {
      type: Date,
    },
    totalActivities: {
      type: Number,
      default: 0,
    },
    totalEmails: {
      type: Number,
      default: 0,
    },
    socialProfiles: {
      type: SocialProfilesSchema,
    },
    marketingConsent: {
      type: Boolean,
      default: false,
    },
    consentTimestamp: {
      type: Date,
    },
    doNotContact: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: RichNotesSchema,
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
    collection: 'crm_contacts',
  }
);

// Org-scoped trash queries — only indexes soft-deleted rows.
CrmContactSchema.index(
  { deletedAt: 1 },
  { partialFilterExpression: { deletedAt: { $exists: true } } }
);

// Indexes for performance.
// NOTE: the org+email unique index stays scoped to the SCALAR primary email only.
// Multi-value emails are intentionally NOT globally unique — only the primary
// email per contact is enforced unique per org (Twenty-style: a person can list
// the same secondary address that's someone else's primary). The non-unique
// `emails.value` index below powers "match any email" lookups.
CrmContactSchema.index({ email: 1 }, { unique: true, sparse: true });
// Org-scoped non-unique lookups across ALL email/phone values (multi-value match).
CrmContactSchema.index({ 'emails.value': 1 });
CrmContactSchema.index({ 'phones.normalized': 1 });
CrmContactSchema.index({ status: 1, ownerId: 1 });
CrmContactSchema.index({ companyId: 1 });
CrmContactSchema.index({ tags: 1 });
CrmContactSchema.index({ createdAt: -1 });
CrmContactSchema.index({ lastActivityAt: -1 });
CrmContactSchema.index({ 'channels.type': 1, 'channels.identifier': 1 });
// Identity resolver lookups (X2): digits-only phone match scoped to org.
CrmContactSchema.index({ phoneNormalized: 1 }, { sparse: true });
// Agency-mode brand-scoped lookups (B3-4.6.1).
CrmContactSchema.index({ brandId: 1 });
CrmContactSchema.index({ brandId: 1, email: 1 }, { sparse: true });
CrmContactSchema.index({ brandId: 1, phoneNormalized: 1 }, { sparse: true });

// Keep phoneNormalized in sync with phone on every save.
CrmContactSchema.pre('save', function syncPhoneNormalized(next) {
  if (this.isModified('phone')) {
    const digits = (this.phone || '').replace(/\D/g, '');
    this.phoneNormalized = digits.length >= 7 ? digits : undefined;
  }
  next();
});

// Same sync on updateOne / findOneAndUpdate when callers set `phone` via $set.
function syncPhoneNormalizedOnUpdate(this: { getUpdate(): unknown; setUpdate?: (u: unknown) => void }) {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (!update) return;
  const $set = (update.$set ?? update) as Record<string, unknown>;
  if (typeof $set.phone === 'string') {
    const digits = $set.phone.replace(/\D/g, '');
    $set.phoneNormalized = digits.length >= 7 ? digits : undefined;
  } else if ('phone' in $set && $set.phone == null) {
    $set.phoneNormalized = undefined;
  }
}
CrmContactSchema.pre('updateOne', syncPhoneNormalizedOnUpdate);
CrmContactSchema.pre('findOneAndUpdate', syncPhoneNormalizedOnUpdate);
CrmContactSchema.pre('updateMany', syncPhoneNormalizedOnUpdate);

// Text index for search
CrmContactSchema.index(
  { firstName: 'text', lastName: 'text', email: 'text', 'notes.plainText': 'text' },
  { name: 'contact_text_search' }
);

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmContact) {
    delete mongoose.models.CrmContact;
  }
}

const CrmContact: Model<ICrmContact> =
  mongoose.models.CrmContact || mongoose.model<ICrmContact>('CrmContact', CrmContactSchema);

export default CrmContact;
