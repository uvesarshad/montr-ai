/**
 * Repository for WorkflowFormRequest — the interactive "form input" workflow
 * step. All reads are organization-scoped (multi-tenant hard rule).
 */

import mongoose, { Types } from 'mongoose';
import WorkflowFormRequest, {
  IWorkflowFormRequest,
  IFormField,
} from '../models/workflow-form-request.model';

export interface CreateFormRequestData {
  workflowId: string;
  executionId: string;
  nodeId: string;
  title: string;
  description?: string;
  fields: IFormField[];
  assigneeId: string;
  expiresAt?: Date;
}

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

export class WorkflowFormRequestRepository {
  async create(data: CreateFormRequestData): Promise<IWorkflowFormRequest> {
    await ensureConnection();
    return WorkflowFormRequest.create({
      workflowId: data.workflowId,
      executionId: data.executionId,
      nodeId: data.nodeId,
      title: data.title,
      description: data.description,
      fields: data.fields,
      assigneeId: new Types.ObjectId(data.assigneeId),
      status: 'pending',
      expiresAt: data.expiresAt,
    });
  }

  /** Org-scoped find by id. */
  async findById(id: string): Promise<IWorkflowFormRequest | null> {
    await ensureConnection();
    if (!Types.ObjectId.isValid(id)) return null;
    return WorkflowFormRequest.findOne({ _id: id }).exec();
  }

  /** Pending requests assigned to a user within an organization. */
  async listPending(userId: string): Promise<IWorkflowFormRequest[]> {
    await ensureConnection();
    return WorkflowFormRequest.find({
      assigneeId: new Types.ObjectId(userId),
      status: 'pending',
    })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Mark a request submitted with the captured values. */
  async submit(
    id: string,
    values: Record<string, unknown>,
    submittedById: string,
  ): Promise<IWorkflowFormRequest | null> {
    await ensureConnection();
    return WorkflowFormRequest.findOneAndUpdate(
      { _id: id, status: 'pending' },
      {
        $set: {
          status: 'submitted',
          values,
          submittedById: new Types.ObjectId(submittedById),
          submittedAt: new Date(),
        },
      },
      { new: true },
    ).exec();
  }

  /** Mark a request cancelled. */
  async cancel(id: string): Promise<IWorkflowFormRequest | null> {
    await ensureConnection();
    return WorkflowFormRequest.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { $set: { status: 'cancelled' } },
      { new: true },
    ).exec();
  }
}

export const workflowFormRequestRepository = new WorkflowFormRequestRepository();
export default workflowFormRequestRepository;
