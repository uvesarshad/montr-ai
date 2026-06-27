import mongoose, { Types } from 'mongoose';
import OrgVariable, { IOrgVariable } from '../models/org-variable.model';

export interface CreateOrgVariableInput {
  brandId?: string | null;
  key: string;
  value: string;
  description?: string | null;
}

export interface UpdateOrgVariableInput {
  key?: string;
  value?: string;
  brandId?: string | null;
  description?: string | null;
}

export class OrgVariableRepository {
  /**
   * List all variables for an organization (org-level + all brand overrides).
   */
  async listByOrg(): Promise<IOrgVariable[]> {
    await this.ensureConnection();
    return OrgVariable.find({ })
      .sort({ key: 1, brandId: 1 })
      .exec();
  }

  /**
   * Resolve the effective variable map for an execution. Org-level values
   * (brandId null) are the base; brand-scoped values override per key when a
   * brandId is supplied. One DB read.
   */
  async resolveForExecution(
    brandId?: string | null
  ): Promise<Record<string, string>> {
    await this.ensureConnection();

    const orgFilter: Record<string, unknown> = { };
    if (brandId) {
      orgFilter.$or = [{ brandId: null }, { brandId }];
    } else {
      orgFilter.brandId = null;
    }

    const docs = await OrgVariable.find(orgFilter).lean().exec();

    const out: Record<string, string> = {};
    // Apply org-level first, then brand-level so brand overrides win.
    for (const d of docs) {
      if (!d.brandId) out[d.key] = d.value;
    }
    if (brandId) {
      for (const d of docs) {
        if (d.brandId && d.brandId.toString() === brandId) out[d.key] = d.value;
      }
    }
    return out;
  }

  async findById(id: string): Promise<IOrgVariable | null> {
    await this.ensureConnection();
    if (!Types.ObjectId.isValid(id)) return null;
    return OrgVariable.findById(id).exec();
  }

  async create(input: CreateOrgVariableInput): Promise<IOrgVariable> {
    await this.ensureConnection();
    const doc = new OrgVariable({
      brandId: input.brandId || null,
      key: input.key.trim(),
      value: input.value,
      description: input.description,
    });
    return doc.save();
  }

  /**
   * Update a variable scoped to the org (defense-in-depth tenant filter).
   */
  async update(
    id: string,
    data: UpdateOrgVariableInput
  ): Promise<IOrgVariable | null> {
    await this.ensureConnection();
    if (!Types.ObjectId.isValid(id)) return null;

    const updateData: Record<string, unknown> = {};
    if (data.key !== undefined) updateData.key = data.key.trim();
    if (data.value !== undefined) updateData.value = data.value;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.brandId !== undefined) updateData.brandId = data.brandId || null;

    return OrgVariable.findOneAndUpdate(
      { _id: id },
      { $set: updateData },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await OrgVariable.deleteOne({ _id: id });
    return res.deletedCount > 0;
  }

  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }
}

export const orgVariableRepository = new OrgVariableRepository();
