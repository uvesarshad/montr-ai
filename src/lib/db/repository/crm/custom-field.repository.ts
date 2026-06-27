import mongoose, { Types } from 'mongoose';
import CrmCustomField, { ICrmCustomField, CustomFieldType } from '../../models/crm/custom-field.model';

export interface CreateCustomFieldDto {
  entityType: 'contact' | 'company' | 'deal';
  fieldKey: string;
  fieldLabel: string;
  fieldType: CustomFieldType;
  options?: { value: string; label: string; color?: string }[];
  required?: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  regex?: string;
  order?: number;
  showInList?: boolean;
  showInCreate?: boolean;
  showInFilters?: boolean;
  width?: string;
  createdById: string;
}

export interface UpdateCustomFieldDto {
  fieldLabel?: string;
  fieldType?: CustomFieldType;
  options?: { value: string; label: string; color?: string }[];
  required?: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  regex?: string;
  order?: number;
  showInList?: boolean;
  showInCreate?: boolean;
  showInFilters?: boolean;
  width?: string;
  isActive?: boolean;
}

export class CustomFieldRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmCustomField | null> {
    await this.ensureConnection();
    return CrmCustomField.findOne({ _id: id }).exec();
  }

  async findByKey(
    fieldKey: string,
    entityType: string
  ): Promise<ICrmCustomField | null> {
    await this.ensureConnection();
    return CrmCustomField.findOne({ fieldKey, entityType }).exec();
  }

  async findByEntityType(
    entityType: 'contact' | 'company' | 'deal',
    activeOnly: boolean = true
  ): Promise<ICrmCustomField[]> {
    await this.ensureConnection();
    const query: Record<string, unknown> = { entityType };
    if (activeOnly) {
      query.isActive = true;
    }
    return CrmCustomField.find(query).sort({ order: 1 }).exec();
  }

  async findAll(activeOnly: boolean = true): Promise<ICrmCustomField[]> {
    await this.ensureConnection();
    const query: Record<string, unknown> = { };
    if (activeOnly) {
      query.isActive = true;
    }
    return CrmCustomField.find(query).sort({ entityType: 1, order: 1 }).exec();
  }

  async create(data: CreateCustomFieldDto): Promise<ICrmCustomField> {
    await this.ensureConnection();

    // Auto-generate order if not provided
    let order = data.order;
    if (order === undefined) {
      const maxOrder = await CrmCustomField.findOne({
        entityType: data.entityType,
      })
        .sort({ order: -1 })
        .select('order')
        .exec();
      order = (maxOrder?.order || 0) + 1;
    }

    const customField = new CrmCustomField({
      entityType: data.entityType,
      fieldKey: data.fieldKey,
      fieldLabel: data.fieldLabel,
      fieldType: data.fieldType,
      options: data.options,
      required: data.required || false,
      defaultValue: data.defaultValue,
      min: data.min,
      max: data.max,
      regex: data.regex,
      order,
      showInList: data.showInList ?? true,
      showInCreate: data.showInCreate ?? true,
      showInFilters: data.showInFilters ?? false,
      width: data.width,
      isActive: true,
      createdById: new Types.ObjectId(data.createdById),
    });

    return customField.save();
  }

  async update(
    id: string,
    data: UpdateCustomFieldDto
  ): Promise<ICrmCustomField | null> {
    await this.ensureConnection();
    return CrmCustomField.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmCustomField.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async reorder(
    entityType: string,
    fieldOrder: { id: string; order: number }[]
  ): Promise<void> {
    await this.ensureConnection();
    const bulkOps = fieldOrder.map(item => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(item.id), entityType },
        update: { $set: { order: item.order } },
      },
    }));
    await CrmCustomField.bulkWrite(bulkOps);
  }

  async countByOrganization(): Promise<number> {
    await this.ensureConnection();
    return CrmCustomField.countDocuments({ isActive: true }).exec();
  }
}

export const customFieldRepository = new CustomFieldRepository();
