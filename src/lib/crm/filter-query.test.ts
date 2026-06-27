import { describe, it, expect } from 'vitest';
import { filterTreeToMongo, type FilterTree } from './filter-query';

describe('filterTreeToMongo', () => {
  it('returns null for empty tree', () => {
    expect(filterTreeToMongo({ logic: 'and', rules: [] }, 'contact')).toBeNull();
  });

  it('builds a single condition without wrapping', () => {
    const tree: FilterTree = {
      logic: 'and',
      rules: [{ field: 'status', operator: 'equals', value: 'lead' }],
    };
    expect(filterTreeToMongo(tree, 'contact')).toEqual({ status: 'lead' });
  });

  it('regex-escapes contains values (case-insensitive)', () => {
    const tree: FilterTree = {
      logic: 'and',
      rules: [{ field: 'email', operator: 'contains', value: 'a.b+c' }],
    };
    expect(filterTreeToMongo(tree, 'contact')).toEqual({
      email: { $regex: 'a\\.b\\+c', $options: 'i' },
    });
  });

  it('AND/OR group nesting', () => {
    const tree: FilterTree = {
      logic: 'or',
      rules: [{ field: 'rating', operator: 'equals', value: 'hot' }],
      groups: [
        {
          logic: 'and',
          rules: [
            { field: 'status', operator: 'equals', value: 'customer' },
            { field: 'score', operator: 'gt', value: 50 },
          ],
        },
      ],
    };
    expect(filterTreeToMongo(tree, 'contact')).toEqual({
      $or: [
        { rating: 'hot' },
        { $and: [{ status: 'customer' }, { score: { $gt: 50 } }] },
      ],
    });
  });

  it('drops fields starting with $ and disallowed field names', () => {
    const tree: FilterTree = {
      logic: 'and',
      rules: [
        { field: '$where', operator: 'equals', value: 'x' },
        { field: 'not_a_field', operator: 'equals', value: 'y' },
        { field: 'status', operator: 'equals', value: 'lead' },
      ],
    };
    // only the whitelisted `status` survives
    expect(filterTreeToMongo(tree, 'contact')).toEqual({ status: 'lead' });
  });

  it('caps nesting at depth 3', () => {
    const deep: FilterTree = {
      logic: 'and',
      rules: [],
      groups: [
        {
          logic: 'and',
          rules: [],
          groups: [
            {
              logic: 'and',
              rules: [{ field: 'status', operator: 'equals', value: 'lead' }],
              groups: [
                {
                  logic: 'and',
                  rules: [{ field: 'rating', operator: 'equals', value: 'hot' }],
                },
              ],
            },
          ],
        },
      ],
    };
    // depth-4 rule (rating) is dropped; depth-3 status survives
    expect(filterTreeToMongo(deep, 'contact')).toEqual({ status: 'lead' });
  });

  it('skips rules with empty values (except empty/not_empty operators)', () => {
    const tree: FilterTree = {
      logic: 'and',
      rules: [
        { field: 'status', operator: 'equals', value: '' },
        { field: 'email', operator: 'is_not_empty' },
      ],
    };
    expect(filterTreeToMongo(tree, 'contact')).toEqual({
      email: { $exists: true, $nin: [null, ''] },
    });
  });
});
