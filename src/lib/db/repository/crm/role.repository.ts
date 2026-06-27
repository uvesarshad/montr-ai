import mongoose from 'mongoose';
import CrmRole, {
  ICrmRole,
  ICrmRolePermissions,
  DEFAULT_CRM_ROLES,
} from '../../models/crm/role.model';

export interface CreateRoleDto {
  name: string;
  description?: string;
  permissions: ICrmRolePermissions;
  canManageSettings: boolean;
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  permissions?: ICrmRolePermissions;
  canManageSettings?: boolean;
}

export class CrmRoleRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  /**
   * Lazily seed the system default roles for an org on first read.
   * Idempotent — uses the unique {org,name} index to avoid duplicates under
   * concurrency.
   */
  async ensureSeeded(): Promise<void> {
    await this.ensureConnection();
    const count = await CrmRole.countDocuments({ isSystem: true }).exec();
    if (count >= DEFAULT_CRM_ROLES.length) return;

    for (const seed of DEFAULT_CRM_ROLES) {
      try {
        await CrmRole.updateOne(
          { name: seed.name },
          {
            $setOnInsert: {
              name: seed.name,
              description: seed.description,
              isSystem: true,
              canManageSettings: seed.canManageSettings,
              permissions: seed.permissions,
            },
          },
          { upsert: true }
        ).exec();
      } catch {
        // ignore duplicate-key races
      }
    }
  }

  async findAll(): Promise<ICrmRole[]> {
    await this.ensureSeeded();
    return CrmRole.find({ }).sort({ isSystem: -1, name: 1 }).exec();
  }

  async findById(id: string): Promise<ICrmRole | null> {
    await this.ensureConnection();
    if (!mongoose.isValidObjectId(id)) return null;
    return CrmRole.findOne({ _id: id }).exec();
  }

  async findByName(name: string): Promise<ICrmRole | null> {
    await this.ensureConnection();
    return CrmRole.findOne({ name }).exec();
  }

  async create(data: CreateRoleDto): Promise<ICrmRole> {
    await this.ensureConnection();
    return CrmRole.create({ ...data, isSystem: false });
  }

  async update(
    id: string,
    data: UpdateRoleDto
  ): Promise<ICrmRole | null> {
    await this.ensureConnection();
    if (!mongoose.isValidObjectId(id)) return null;
    return CrmRole.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    if (!mongoose.isValidObjectId(id)) return false;
    const res = await CrmRole.deleteOne({ _id: id, isSystem: false }).exec();
    return res.deletedCount > 0;
  }
}

export const crmRoleRepository = new CrmRoleRepository();
