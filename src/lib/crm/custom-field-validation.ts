/**
 * Custom Field Validation Schema
 * Provides validation for complex custom field types in CRM
 */

import { z } from 'zod';

// Define supported custom field types
export enum CustomFieldType {
    TEXT = 'text',
    NUMBER = 'number',
    EMAIL = 'email',
    PHONE = 'phone',
    URL = 'url',
    DATE = 'date',
    DATETIME = 'datetime',
    BOOLEAN = 'boolean',
    SELECT = 'select',
    MULTI_SELECT = 'multi_select',
    CURRENCY = 'currency',
    PERCENTAGE = 'percentage',
    JSON = 'json',
}

// Phone number validation regex (international format)
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

// Currency validation (supports major currencies)
const CURRENCY_REGEX = /^-?\d+(\.\d{1,2})?$/;

// Percentage validation (0-100 or 0.00-100.00)
const PERCENTAGE_REGEX = /^(100(\.0{1,2})?|[0-9]?[0-9](\.\d{1,2})?)$/;

/**
 * Build Zod validator for a custom field based on its type and configuration
 */
export function buildCustomFieldValidator(
    fieldType: CustomFieldType,
    config?: {
        required?: boolean;
        min?: number;
        max?: number;
        options?: string[];
        pattern?: string;
    }
): z.ZodTypeAny {
    let validator: z.ZodTypeAny;

    switch (fieldType) {
        case CustomFieldType.TEXT:
            validator = z.string();
            if (config?.min) validator = (validator as z.ZodString).min(config.min);
            if (config?.max) validator = (validator as z.ZodString).max(config.max);
            if (config?.pattern) {
                validator = (validator as z.ZodString).regex(new RegExp(config.pattern));
            }
            break;

        case CustomFieldType.NUMBER:
            validator = z.number();
            if (config?.min !== undefined) validator = (validator as z.ZodNumber).min(config.min);
            if (config?.max !== undefined) validator = (validator as z.ZodNumber).max(config.max);
            break;

        case CustomFieldType.EMAIL:
            validator = z.string().email('Invalid email address');
            break;

        case CustomFieldType.PHONE:
            validator = z.string().regex(PHONE_REGEX, 'Invalid phone number format');
            break;

        case CustomFieldType.URL:
            validator = z.string().url('Invalid URL');
            break;

        case CustomFieldType.DATE:
            validator = z.string().refine(
                (val) => !isNaN(Date.parse(val)),
                'Invalid date format'
            );
            break;

        case CustomFieldType.DATETIME:
            validator = z.string().datetime('Invalid datetime format');
            break;

        case CustomFieldType.BOOLEAN:
            validator = z.boolean();
            break;

        case CustomFieldType.SELECT:
            if (config?.options && config.options.length > 0) {
                validator = z.enum(config.options as [string, ...string[]]);
            } else {
                validator = z.string();
            }
            break;

        case CustomFieldType.MULTI_SELECT:
            if (config?.options && config.options.length > 0) {
                validator = z.array(z.enum(config.options as [string, ...string[]]));
            } else {
                validator = z.array(z.string());
            }
            if (config?.min) validator = (validator as z.ZodArray<z.ZodTypeAny>).min(config.min);
            if (config?.max) validator = (validator as z.ZodArray<z.ZodTypeAny>).max(config.max);
            break;

        case CustomFieldType.CURRENCY:
            validator = z.string().regex(CURRENCY_REGEX, 'Invalid currency format');
            break;

        case CustomFieldType.PERCENTAGE:
            validator = z.string().regex(PERCENTAGE_REGEX, 'Invalid percentage (must be 0-100)');
            break;

        case CustomFieldType.JSON:
            validator = z.string().refine(
                (val) => {
                    try {
                        JSON.parse(val);
                        return true;
                    } catch {
                        return false;
                    }
                },
                'Invalid JSON format'
            );
            break;

        default:
            validator = z.any();
    }

    // Make optional if not required
    if (!config?.required) {
        validator = validator.optional().nullable();
    }

    return validator;
}

/**
 * Validate custom fields against their schema
 */
export function validateCustomFields(
    fields: Record<string, unknown>,
    fieldDefinitions: Array<{
        key: string;
        type: CustomFieldType;
        required?: boolean;
        min?: number;
        max?: number;
        options?: string[];
        pattern?: string;
    }>
): { valid: boolean; errors?: Record<string, string> } {
    const errors: Record<string, string> = {};

    for (const definition of fieldDefinitions) {
        const value = fields[definition.key];
        const validator = buildCustomFieldValidator(definition.type, {
            required: definition.required,
            min: definition.min,
            max: definition.max,
            options: definition.options,
            pattern: definition.pattern,
        });

        try {
            validator.parse(value);
        } catch (error) {
            if (error instanceof z.ZodError) {
                errors[definition.key] = error.errors[0]?.message || 'Validation failed';
            }
        }
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
}

/**
 * Build complete schema for custom fields
 */
export function buildCustomFieldsSchema(
    fieldDefinitions: Array<{
        key: string;
        type: CustomFieldType;
        required?: boolean;
        min?: number;
        max?: number;
        options?: string[];
        pattern?: string;
    }>
): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const definition of fieldDefinitions) {
        shape[definition.key] = buildCustomFieldValidator(definition.type, {
            required: definition.required,
            min: definition.min,
            max: definition.max,
            options: definition.options,
            pattern: definition.pattern,
        });
    }

    return z.object(shape);
}
