import mongoose, { Schema, Document, Model } from 'mongoose';

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'user'
  | 'contact'
  | 'company';

export interface ICustomFieldOption {
  value: string;
  label: string;
  color?: string;
}

export interface ICrmCustomField extends Document {
  entityType: 'contact' | 'company' | 'deal';
  fieldKey: string;
  fieldLabel: string;
  fieldType: CustomFieldType;

  // For select/multiselect
  options: ICustomFieldOption[];

  // Validation
  required: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  regex?: string;

  // Display
  order: number;
  showInList: boolean;
  showInCreate: boolean;
  showInFilters: boolean;
  width?: string;

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const CustomFieldOptionSchema = new Schema({
  value: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  color: String,
}, { _id: false });

const CrmCustomFieldSchema = new Schema<ICrmCustomField>(
  {
    entityType: {
      type: String,
      enum: ['contact', 'company', 'deal'],
      required: true,
    },
    fieldKey: {
      type: String,
      required: true,
      trim: true,
    },
    fieldLabel: {
      type: String,
      required: true,
      trim: true,
    },
    fieldType: {
      type: String,
      enum: [
        'text', 'textarea', 'number', 'currency', 'date', 'datetime',
        'select', 'multiselect', 'checkbox', 'url', 'email', 'phone',
        'user', 'contact', 'company'
      ],
      required: true,
    },
    options: {
      type: [CustomFieldOptionSchema],
      default: [],
    },
    required: {
      type: Boolean,
      default: false,
    },
    defaultValue: Schema.Types.Mixed,
    min: Number,
    max: Number,
    regex: String,
    order: {
      type: Number,
      default: 0,
    },
    showInList: {
      type: Boolean,
      default: false,
    },
    showInCreate: {
      type: Boolean,
      default: true,
    },
    showInFilters: {
      type: Boolean,
      default: false,
    },
    width: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_custom_fields',
  }
);

// Indexes
CrmCustomFieldSchema.index({ entityType: 1, fieldKey: 1 }, { unique: true });
CrmCustomFieldSchema.index({ entityType: 1, order: 1 });
CrmCustomFieldSchema.index({ entityType: 1, isActive: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmCustomField) {
    delete mongoose.models.CrmCustomField;
  }
}

const CrmCustomField: Model<ICrmCustomField> =
  mongoose.models.CrmCustomField || mongoose.model<ICrmCustomField>('CrmCustomField', CrmCustomFieldSchema);

export default CrmCustomField;
