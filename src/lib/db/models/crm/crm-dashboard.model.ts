import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * Per-USER CRM overview dashboard config (Twenty Dashboard-lite).
 *
 * Stores the order + visibility of the EXISTING widgets on the CRM overview
 * page (`/crm`). One document per organization + user (dashboards are
 * personal; org still scopes data fetching). The catalog of valid widget keys
 * lives in `src/components/crm/dashboard/widget-catalog.ts`.
 */
export interface ICrmDashboardWidget {
  key: string;
  visible: boolean;
  order: number;
}

export interface ICrmDashboard extends Document {
  userId: Types.ObjectId;
  widgets: ICrmDashboardWidget[];
  createdAt: Date;
  updatedAt: Date;
}

const CrmDashboardWidgetSchema = new Schema(
  {
    key: { type: String, required: true },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const CrmDashboardSchema = new Schema<ICrmDashboard>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    widgets: {
      type: [CrmDashboardWidgetSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'crm_dashboards',
  }
);

// One dashboard document per org + user.
CrmDashboardSchema.index({ userId: 1 }, { unique: true });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmDashboard) {
    delete mongoose.models.CrmDashboard;
  }
}

const CrmDashboard: Model<ICrmDashboard> =
  mongoose.models.CrmDashboard ||
  mongoose.model<ICrmDashboard>('CrmDashboard', CrmDashboardSchema);

export default CrmDashboard;
