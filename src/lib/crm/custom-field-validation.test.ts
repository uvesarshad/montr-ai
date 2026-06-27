import { describe, it, expect } from 'vitest';
import {
  CustomFieldType,
  buildCustomFieldValidator,
  validateCustomFields,
  buildCustomFieldsSchema,
} from './custom-field-validation';

describe('buildCustomFieldValidator', () => {
  it('makes fields optional + nullable by default (not required)', () => {
    const v = buildCustomFieldValidator(CustomFieldType.TEXT);
    expect(v.safeParse(undefined).success).toBe(true);
    expect(v.safeParse(null).success).toBe(true);
    expect(v.safeParse('hello').success).toBe(true);
  });

  it('rejects missing value when required', () => {
    const v = buildCustomFieldValidator(CustomFieldType.TEXT, { required: true });
    expect(v.safeParse(undefined).success).toBe(false);
    expect(v.safeParse('hello').success).toBe(true);
  });

  it('enforces text min/max length', () => {
    const v = buildCustomFieldValidator(CustomFieldType.TEXT, {
      required: true,
      min: 2,
      max: 4,
    });
    expect(v.safeParse('a').success).toBe(false);
    expect(v.safeParse('ab').success).toBe(true);
    expect(v.safeParse('abcde').success).toBe(false);
  });

  it('enforces text regex pattern', () => {
    const v = buildCustomFieldValidator(CustomFieldType.TEXT, {
      required: true,
      pattern: '^[A-Z]{3}$',
    });
    expect(v.safeParse('ABC').success).toBe(true);
    expect(v.safeParse('abc').success).toBe(false);
  });

  it('enforces number min/max including zero bounds', () => {
    const v = buildCustomFieldValidator(CustomFieldType.NUMBER, {
      required: true,
      min: 0,
      max: 10,
    });
    expect(v.safeParse(0).success).toBe(true);
    expect(v.safeParse(-1).success).toBe(false);
    expect(v.safeParse(11).success).toBe(false);
    expect(v.safeParse('5').success).toBe(false); // strict number, no coercion
  });

  it('validates email', () => {
    const v = buildCustomFieldValidator(CustomFieldType.EMAIL, { required: true });
    expect(v.safeParse('a@b.com').success).toBe(true);
    expect(v.safeParse('not-an-email').success).toBe(false);
  });

  it('validates international phone format', () => {
    const v = buildCustomFieldValidator(CustomFieldType.PHONE, { required: true });
    expect(v.safeParse('+14155552671').success).toBe(true);
    expect(v.safeParse('abc123').success).toBe(false);
    expect(v.safeParse('+0123').success).toBe(false); // cannot start with 0 after +
  });

  it('validates url', () => {
    const v = buildCustomFieldValidator(CustomFieldType.URL, { required: true });
    expect(v.safeParse('https://example.com').success).toBe(true);
    expect(v.safeParse('example').success).toBe(false);
  });

  it('validates loose date via Date.parse', () => {
    const v = buildCustomFieldValidator(CustomFieldType.DATE, { required: true });
    expect(v.safeParse('2026-01-15').success).toBe(true);
    expect(v.safeParse('definitely-not-a-date').success).toBe(false);
  });

  it('validates strict ISO datetime', () => {
    const v = buildCustomFieldValidator(CustomFieldType.DATETIME, { required: true });
    expect(v.safeParse('2026-01-15T10:30:00Z').success).toBe(true);
    expect(v.safeParse('2026-01-15').success).toBe(false);
  });

  it('validates boolean', () => {
    const v = buildCustomFieldValidator(CustomFieldType.BOOLEAN, { required: true });
    expect(v.safeParse(true).success).toBe(true);
    expect(v.safeParse('true').success).toBe(false);
  });

  it('builds an enum for SELECT with options and a plain string without', () => {
    const withOpts = buildCustomFieldValidator(CustomFieldType.SELECT, {
      required: true,
      options: ['a', 'b'],
    });
    expect(withOpts.safeParse('a').success).toBe(true);
    expect(withOpts.safeParse('c').success).toBe(false);

    const noOpts = buildCustomFieldValidator(CustomFieldType.SELECT, { required: true });
    expect(noOpts.safeParse('anything').success).toBe(true);
  });

  it('validates MULTI_SELECT arrays and min/max length', () => {
    const v = buildCustomFieldValidator(CustomFieldType.MULTI_SELECT, {
      required: true,
      options: ['a', 'b', 'c'],
      min: 1,
      max: 2,
    });
    expect(v.safeParse([]).success).toBe(false); // below min
    expect(v.safeParse(['a']).success).toBe(true);
    expect(v.safeParse(['a', 'b', 'c']).success).toBe(false); // above max
    expect(v.safeParse(['a', 'z']).success).toBe(false); // invalid option
  });

  it('validates currency format', () => {
    const v = buildCustomFieldValidator(CustomFieldType.CURRENCY, { required: true });
    expect(v.safeParse('100').success).toBe(true);
    expect(v.safeParse('-12.50').success).toBe(true);
    expect(v.safeParse('12.345').success).toBe(false);
  });

  it('validates percentage range 0-100', () => {
    const v = buildCustomFieldValidator(CustomFieldType.PERCENTAGE, { required: true });
    expect(v.safeParse('0').success).toBe(true);
    expect(v.safeParse('100').success).toBe(true);
    expect(v.safeParse('99.99').success).toBe(true);
    expect(v.safeParse('150').success).toBe(false);
  });

  it('validates JSON string parseability', () => {
    const v = buildCustomFieldValidator(CustomFieldType.JSON, { required: true });
    expect(v.safeParse('{"a":1}').success).toBe(true);
    expect(v.safeParse('{not json}').success).toBe(false);
  });
});

describe('validateCustomFields', () => {
  it('returns valid + no errors when all fields pass', () => {
    const res = validateCustomFields(
      { name: 'Acme', count: 3 },
      [
        { key: 'name', type: CustomFieldType.TEXT, required: true },
        { key: 'count', type: CustomFieldType.NUMBER, required: true },
      ],
    );
    expect(res.valid).toBe(true);
    expect(res.errors).toBeUndefined();
  });

  it('collects an error keyed by the failing field', () => {
    const res = validateCustomFields(
      { email: 'bad' },
      [{ key: 'email', type: CustomFieldType.EMAIL, required: true }],
    );
    expect(res.valid).toBe(false);
    expect(res.errors?.email).toBe('Invalid email address');
  });

  it('treats optional missing fields as valid', () => {
    const res = validateCustomFields(
      {},
      [{ key: 'note', type: CustomFieldType.TEXT }],
    );
    expect(res.valid).toBe(true);
  });
});

describe('buildCustomFieldsSchema', () => {
  it('builds a composite object schema keyed by field', () => {
    const schema = buildCustomFieldsSchema([
      { key: 'name', type: CustomFieldType.TEXT, required: true },
      { key: 'active', type: CustomFieldType.BOOLEAN },
    ]);
    expect(schema.safeParse({ name: 'x', active: true }).success).toBe(true);
    expect(schema.safeParse({ active: true }).success).toBe(false); // name required
    expect(schema.safeParse({ name: 'x' }).success).toBe(true); // active optional
  });
});
