import mongoose from 'mongoose';
import WhatsAppCustomField, { IWhatsAppCustomField } from '../models/whatsapp-custom-field.model';
import WhatsAppCustomFieldValue from '../models/whatsapp-custom-field-value.model';

export interface CreateCustomFieldDto {
    whatsappAccountId: string;
    name: string;
    fieldKey: string;
    fieldType: 'text' | 'number' | 'date' | 'dropdown' | 'checkbox' | 'url' | 'email' | 'phone';
    options?: string[];
    defaultValue?: string;
    required?: boolean;
    order?: number;
    createdById: string;
}

export interface UpdateCustomFieldDto {
    name?: string;
    options?: string[];
    defaultValue?: string;
    required?: boolean;
    order?: number;
}

export interface SetFieldValueDto {
    fieldId: string;
    contactId: string;
    value: string;
}

export class WhatsAppCustomFieldRepository {
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }

    // Custom Field Management
    async create(data: CreateCustomFieldDto): Promise<IWhatsAppCustomField> {
        await this.ensureConnection();
        const field = new WhatsAppCustomField(data);
        return field.save();
    }

    async findById(id: string): Promise<IWhatsAppCustomField | null> {
        await this.ensureConnection();
        return WhatsAppCustomField.findById(id).exec();
    }

    async findByKey(whatsappAccountId: string, fieldKey: string): Promise<IWhatsAppCustomField | null> {
        await this.ensureConnection();
        return WhatsAppCustomField.findOne({
            whatsappAccountId,
            fieldKey,
            deletedAt: null,
        }).exec();
    }

    async findByOrganization(includeDeleted: boolean = false): Promise<IWhatsAppCustomField[]> {
        await this.ensureConnection();
        const query: Record<string, unknown> = { };
        if (!includeDeleted) {
            query.deletedAt = null;
        }
        return WhatsAppCustomField.find(query).sort({ order: 1, name: 1 }).exec();
    }

    async findByAccount(whatsappAccountId: string, includeDeleted: boolean = false): Promise<IWhatsAppCustomField[]> {
        await this.ensureConnection();
        const query: Record<string, unknown> = { whatsappAccountId };
        if (!includeDeleted) {
            query.deletedAt = null;
        }
        return WhatsAppCustomField.find(query).sort({ order: 1, name: 1 }).exec();
    }

    async update(id: string, data: UpdateCustomFieldDto): Promise<IWhatsAppCustomField | null> {
        await this.ensureConnection();
        return WhatsAppCustomField.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
    }

    async softDelete(id: string): Promise<IWhatsAppCustomField | null> {
        await this.ensureConnection();
        return WhatsAppCustomField.findByIdAndUpdate(id, { $set: { deletedAt: new Date() } }, { new: true }).exec();
    }

    async hardDelete(id: string): Promise<boolean> {
        await this.ensureConnection();
        // Delete all values first
        await WhatsAppCustomFieldValue.deleteMany({ fieldId: id }).exec();
        // Delete field
        const result = await WhatsAppCustomField.deleteOne({ _id: id }).exec();
        return result.deletedCount > 0;
    }

    // Field Value Management
    async setFieldValue(data: SetFieldValueDto): Promise<void> {
        await this.ensureConnection();

        await WhatsAppCustomFieldValue.findOneAndUpdate(
            {
                fieldId: data.fieldId,
                contactId: data.contactId,
            },
            {
                $set: {
                    value: data.value,
                },
            },
            { upsert: true, new: true }
        ).exec();
    }

    async getFieldValue(fieldId: string, contactId: string): Promise<string | null> {
        await this.ensureConnection();

        const fieldValue = await WhatsAppCustomFieldValue.findOne({
            fieldId,
            contactId,
        }).exec();

        return fieldValue ? fieldValue.value : null;
    }

    async getContactFieldValues(contactId: string): Promise<Record<string, string>> {
        await this.ensureConnection();

        const fieldValues = await WhatsAppCustomFieldValue.find({ contactId })
            .populate('fieldId', 'fieldKey')
            .exec();

        const result: Record<string, string> = {};
        for (const fv of fieldValues) {
            const field = fv.fieldId as { fieldKey?: string };
            if (field && field.fieldKey) {
                result[field.fieldKey] = fv.value;
            }
        }

        return result;
    }

    async getContactFieldValuesWithDetails(
        contactId: string
    ): Promise<Array<{ field: IWhatsAppCustomField; value: string }>> {
        await this.ensureConnection();

        // Get all fields for organization
        const fields = await this.findByOrganization();

        // Get all values for contact
        const fieldValues = await WhatsAppCustomFieldValue.find({ contactId }).exec();

        // Map values to fields
        const valueMap = new Map<string, string>();
        fieldValues.forEach((fv) => {
            valueMap.set(fv.fieldId.toString(), fv.value);
        });

        // Combine fields with their values
        return fields.map((field) => ({
            field,
            value: valueMap.get(field._id.toString()) || field.defaultValue || '',
        }));
    }

    async bulkSetFieldValues(contactId: string, values: Record<string, string>): Promise<void> {
        await this.ensureConnection();

        const fields = await this.findByOrganization();
        const fieldKeyMap = new Map(fields.map((f) => [f.fieldKey, f._id.toString()]));

        for (const [fieldKey, value] of Object.entries(values)) {
            const fieldId = fieldKeyMap.get(fieldKey);
            if (fieldId && value) {
                await this.setFieldValue({
                    fieldId,
                    contactId,
                    value,
                });
            }
        }
    }

    async deleteFieldValue(fieldId: string, contactId: string): Promise<boolean> {
        await this.ensureConnection();
        const result = await WhatsAppCustomFieldValue.deleteOne({ fieldId, contactId }).exec();
        return result.deletedCount > 0;
    }

    async deleteAllContactFieldValues(contactId: string): Promise<number> {
        await this.ensureConnection();
        const result = await WhatsAppCustomFieldValue.deleteMany({ contactId }).exec();
        return result.deletedCount;
    }

    async reorderFields(fieldIds: string[]): Promise<void> {
        await this.ensureConnection();

        for (let i = 0; i < fieldIds.length; i++) {
            await WhatsAppCustomField.findByIdAndUpdate(fieldIds[i], { $set: { order: i } }).exec();
        }
    }

    async getFieldStats(): Promise<{
        totalFields: number;
        fieldsByType: Record<string, number>;
        fieldsWithValues: number;
    }> {
        await this.ensureConnection();

        const fields = await this.findByOrganization();
        const totalFields = fields.length;

        const fieldsByType: Record<string, number> = {};
        fields.forEach((field) => {
            fieldsByType[field.fieldType] = (fieldsByType[field.fieldType] || 0) + 1;
        });

        // Count fields that have at least one value
        const fieldIds = fields.map((f) => f._id);
        const fieldsWithValuesResult = await WhatsAppCustomFieldValue.aggregate([
            { $match: { fieldId: { $in: fieldIds } } },
            { $group: { _id: '$fieldId' } },
            { $count: 'count' },
        ]);

        const fieldsWithValues = fieldsWithValuesResult[0]?.count || 0;

        return {
            totalFields,
            fieldsByType,
            fieldsWithValues,
        };
    }
}

export const whatsappCustomFieldRepository = new WhatsAppCustomFieldRepository();
