import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * Org / Brand-level Variable (H8)
 *
 * Reusable key/value strings scoped to an organization, with an optional
 * brand-level override. Surfaced in workflow expressions under the `vars`
 * namespace (e.g. `{{vars.senderName}}`) — the concrete realization of
 * `VariableScope.GLOBAL`. n8n equivalent: `$vars`.
 *
 * Resolution: a brand-scoped value (brandId set) overrides the org-level
 * value (brandId null) for the same key when an execution carries a brandId.
 */
export interface IOrgVariable extends Document {
  brandId?: Types.ObjectId | null;
  key: string;
  value: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrgVariableSchema = new Schema<IOrgVariable>(
  {
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'org_variables',
  }
);

// One value per key per scope (org-level brandId=null, or per brand).
OrgVariableSchema.index(
  { brandId: 1, key: 1 },
  { unique: true }
);

const OrgVariableModel: Model<IOrgVariable> =
  mongoose.models.OrgVariable ||
  mongoose.model<IOrgVariable>('OrgVariable', OrgVariableSchema);

export default OrgVariableModel;
