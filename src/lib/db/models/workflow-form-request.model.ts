/**
 * WorkflowFormRequest — interactive "form input" workflow step (Twenty-style
 * `form` action).
 *
 * When a unified-workflow execution reaches a `form_input` control node, the
 * node processor:
 *   1. Creates one of these documents (status = 'pending'), assigned to a user.
 *   2. Notifies the assignee (in-app notification).
 *   3. Pauses the execution via `ExecutionPausedForEvent` subscribing to
 *      `{ kind: 'form_submitted', key: <formRequestId> }`.
 *
 * When the assignee submits the form (`POST /workflow-forms/[id]/submit`), the
 * submitted `values` are persisted here and `resumePausedExecutionsForEvent`
 * resumes the parked execution — the values land in the wait node's output.
 *
 * Multi-tenant: every request carries `organizationId`. The assignee plus org
 * admins / workflow owner may act on it.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'checkbox'
  | 'date';

export interface IFormField {
  key: string;
  label: string;
  type: FormFieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

export type FormRequestStatus = 'pending' | 'submitted' | 'cancelled';

export interface IWorkflowFormRequest extends Document {
  workflowId: string;
  executionId: string;
  nodeId: string;

  title: string;
  description?: string;
  fields: IFormField[];

  assigneeId: Types.ObjectId;

  status: FormRequestStatus;

  values?: Record<string, unknown>;
  submittedById?: Types.ObjectId;
  submittedAt?: Date;

  expiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const FormFieldSchema = new Schema<IFormField>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ['text', 'textarea', 'number', 'select', 'checkbox', 'date'],
      required: true,
    },
    options: { type: [String], default: undefined },
    required: { type: Boolean, default: false },
    placeholder: { type: String },
  },
  { _id: false },
);

const WorkflowFormRequestSchema = new Schema<IWorkflowFormRequest>(
  {
    workflowId: { type: String, required: true, index: true },
    executionId: { type: String, required: true, index: true },
    nodeId: { type: String, required: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    fields: { type: [FormFieldSchema], default: [] },

    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status: {
      type: String,
      enum: ['pending', 'submitted', 'cancelled'],
      default: 'pending',
      index: true,
    },

    values: { type: Schema.Types.Mixed },
    submittedById: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },

    expiresAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'workflow_form_requests',
  },
);

WorkflowFormRequestSchema.index({ status: 1, createdAt: -1 });
WorkflowFormRequestSchema.index({ assigneeId: 1, status: 1 });

if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.WorkflowFormRequest) {
    delete mongoose.models.WorkflowFormRequest;
  }
}

export const WorkflowFormRequest: Model<IWorkflowFormRequest> =
  mongoose.models.WorkflowFormRequest ||
  mongoose.model<IWorkflowFormRequest>('WorkflowFormRequest', WorkflowFormRequestSchema);

export default WorkflowFormRequest;
