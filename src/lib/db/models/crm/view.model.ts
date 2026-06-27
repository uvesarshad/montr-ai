import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty'
  | 'in'
  | 'not_in';

export interface IViewFilter {
  field: string;
  operator: FilterOperator;
  value?: string | number | boolean | string[];
  conjunction: 'and' | 'or';
}

export interface IViewFilterRule {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface IViewFilterTree {
  logic: 'and' | 'or';
  rules: IViewFilterRule[];
  groups?: IViewFilterTree[];
}

export interface IViewSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ICrmView extends Document {
  name: string;
  entityType: 'contact' | 'company' | 'deal' | 'activity';
  icon?: string;
  color?: string;

  // Filter Configuration
  // Legacy flat rule list — kept untouched for back-compat.
  filters: IViewFilter[];
  // Nested AND/OR filter groups. When present, wins over `filters`.
  filterTree?: IViewFilterTree;

  // Sort Configuration
  sort?: IViewSort;

  // Column Configuration
  columns: string[];
  columnWidths: Record<string, number>;

  // Grouping
  groupBy?: string;

  // Sharing
  visibility: 'private' | 'team' | 'organization';
  ownerId: Types.ObjectId;
  sharedWith: Types.ObjectId[];

  // Position
  order: number;
  isPinned: boolean;

  isDefault: boolean;

  // Record-open behavior: 'panel' opens a side drawer preview, 'page' navigates.
  openRecordIn: 'panel' | 'page';

  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ViewFilterSchema = new Schema({
  field: {
    type: String,
    required: true,
  },
  operator: {
    type: String,
    enum: [
      'equals', 'not_equals', 'contains', 'not_contains',
      'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty', 'in', 'not_in'
    ],
    required: true,
  },
  value: Schema.Types.Mixed,
  conjunction: {
    type: String,
    enum: ['and', 'or'],
    default: 'and',
  },
}, { _id: false });

const ViewSortSchema = new Schema({
  field: {
    type: String,
    required: true,
  },
  direction: {
    type: String,
    enum: ['asc', 'desc'],
    default: 'asc',
  },
}, { _id: false });

const CrmViewSchema = new Schema<ICrmView>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    entityType: {
      type: String,
      enum: ['contact', 'company', 'deal', 'activity'],
      required: true,
    },
    icon: String,
    color: String,
    filters: {
      type: [ViewFilterSchema],
      default: [],
    },
    // Recursive AND/OR group tree. Stored as Mixed (Mongoose can't express a
    // self-referential subdocument); shape is validated by zod at the route
    // boundary and the builder sanitizes field names before querying.
    filterTree: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    sort: ViewSortSchema,
    columns: {
      type: [String],
      default: [],
    },
    columnWidths: {
      type: Schema.Types.Mixed,
      default: {},
    },
    groupBy: String,
    visibility: {
      type: String,
      enum: ['private', 'team', 'organization'],
      default: 'private',
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sharedWith: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
    order: {
      type: Number,
      default: 0,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    openRecordIn: {
      type: String,
      enum: ['panel', 'page'],
      default: 'panel',
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_views',
  }
);

// Indexes
CrmViewSchema.index({ entityType: 1, ownerId: 1 });
CrmViewSchema.index({ entityType: 1, visibility: 1 });
CrmViewSchema.index({ entityType: 1, isDefault: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmView) {
    delete mongoose.models.CrmView;
  }
}

const CrmView: Model<ICrmView> =
  mongoose.models.CrmView || mongoose.model<ICrmView>('CrmView', CrmViewSchema);

export default CrmView;
