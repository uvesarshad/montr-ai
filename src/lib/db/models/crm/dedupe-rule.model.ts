import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Declarative duplicate-detection rules per CRM entity (Twenty's
 * `duplicateCriteria` equivalent). One document per organization + entityType.
 *
 * `criteria` is an OR list of criterion objects; each criterion's `fields` is an
 * AND of field equalities. E.g. contact default `[[email],[phoneNormalized]]`
 * means "duplicate if same email OR same normalized phone".
 */
export interface IDedupeCriterion {
  fields: string[];
}

export interface ICrmDedupeRule extends Document {
  entityType: 'contact' | 'company' | 'deal';
  criteria: IDedupeCriterion[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DedupeCriterionSchema = new Schema(
  {
    fields: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const CrmDedupeRuleSchema = new Schema<ICrmDedupeRule>(
  {
    entityType: {
      type: String,
      enum: ['contact', 'company', 'deal'],
      required: true,
    },
    criteria: {
      type: [DedupeCriterionSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_dedupe_rules',
  }
);

// One rule document per org + entity type.
CrmDedupeRuleSchema.index({ entityType: 1 }, { unique: true });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmDedupeRule) {
    delete mongoose.models.CrmDedupeRule;
  }
}

const CrmDedupeRule: Model<ICrmDedupeRule> =
  mongoose.models.CrmDedupeRule ||
  mongoose.model<ICrmDedupeRule>('CrmDedupeRule', CrmDedupeRuleSchema);

export default CrmDedupeRule;
