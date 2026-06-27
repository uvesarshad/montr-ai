import { describe, it, expect } from 'vitest';
import { parseFilterTreeParam } from './parse-filter-tree-param';

describe('parseFilterTreeParam', () => {
  it('returns undefined for absent params (null / undefined / empty string)', () => {
    expect(parseFilterTreeParam(null, 'contact')).toBeUndefined();
    expect(parseFilterTreeParam(undefined, 'contact')).toBeUndefined();
    expect(parseFilterTreeParam('', 'contact')).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    expect(parseFilterTreeParam('{not valid json', 'contact')).toBeUndefined();
  });

  it('returns undefined when the JSON fails schema validation (bad operator)', () => {
    const raw = JSON.stringify({
      logic: 'and',
      rules: [{ field: 'status', operator: 'frobnicate', value: 'lead' }],
    });
    expect(parseFilterTreeParam(raw, 'contact')).toBeUndefined();
  });

  it('returns undefined for a valid-but-empty tree (no constraints)', () => {
    const raw = JSON.stringify({ logic: 'and', rules: [] });
    expect(parseFilterTreeParam(raw, 'contact')).toBeUndefined();
  });

  it('converts a valid single-rule tree to a sanitized Mongo fragment', () => {
    const raw = JSON.stringify({
      logic: 'and',
      rules: [{ field: 'status', operator: 'equals', value: 'lead' }],
    });
    expect(parseFilterTreeParam(raw, 'contact')).toEqual({ status: 'lead' });
  });

  it('drops non-whitelisted fields, returning undefined when nothing survives', () => {
    const raw = JSON.stringify({
      logic: 'and',
      rules: [{ field: 'not_a_real_field', operator: 'equals', value: 'x' }],
    });
    expect(parseFilterTreeParam(raw, 'contact')).toBeUndefined();
  });
});
