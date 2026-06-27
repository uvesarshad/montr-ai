import { describe, it, expect } from 'vitest';
import { createOrgVariableSchema, updateOrgVariableSchema } from './org-variable';

describe('createOrgVariableSchema', () => {
  it('accepts a minimal valid variable and defaults value to empty string', () => {
    const parsed = createOrgVariableSchema.parse({ key: 'apiBase' });
    expect(parsed.key).toBe('apiBase');
    expect(parsed.value).toBe('');
  });

  it('trims the key', () => {
    const parsed = createOrgVariableSchema.parse({ key: '  token_1  ' });
    expect(parsed.key).toBe('token_1');
  });

  it('allows leading underscore', () => {
    expect(createOrgVariableSchema.parse({ key: '_private' }).key).toBe('_private');
  });

  it('rejects an empty key', () => {
    expect(createOrgVariableSchema.safeParse({ key: '' }).success).toBe(false);
  });

  it('rejects keys that start with a digit', () => {
    expect(createOrgVariableSchema.safeParse({ key: '1abc' }).success).toBe(false);
  });

  it('rejects keys with dots or spaces (would break {{vars.x}} parsing)', () => {
    expect(createOrgVariableSchema.safeParse({ key: 'a.b' }).success).toBe(false);
    expect(createOrgVariableSchema.safeParse({ key: 'a b' }).success).toBe(false);
    expect(createOrgVariableSchema.safeParse({ key: 'a-b' }).success).toBe(false);
  });

  it('rejects a key longer than 64 chars', () => {
    expect(createOrgVariableSchema.safeParse({ key: 'a'.repeat(65) }).success).toBe(false);
    expect(createOrgVariableSchema.safeParse({ key: 'a'.repeat(64) }).success).toBe(true);
  });

  it('rejects a value over 10k chars', () => {
    expect(
      createOrgVariableSchema.safeParse({ key: 'k', value: 'x'.repeat(10_001) }).success
    ).toBe(false);
  });

  it('accepts nullable brandId and description', () => {
    const parsed = createOrgVariableSchema.parse({
      key: 'k',
      brandId: null,
      description: null,
    });
    expect(parsed.brandId).toBeNull();
    expect(parsed.description).toBeNull();
  });

  it('rejects an empty-string brandId (min 1 after trim)', () => {
    expect(createOrgVariableSchema.safeParse({ key: 'k', brandId: '   ' }).success).toBe(false);
  });
});

describe('updateOrgVariableSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(updateOrgVariableSchema.safeParse({}).success).toBe(true);
  });

  it('still validates key format when present', () => {
    expect(updateOrgVariableSchema.safeParse({ key: 'bad key' }).success).toBe(false);
    expect(updateOrgVariableSchema.safeParse({ key: 'good_key' }).success).toBe(true);
  });

  it('does not inject a default value when key is omitted', () => {
    const parsed = updateOrgVariableSchema.parse({ description: 'note' });
    expect('value' in parsed).toBe(false);
  });
});
