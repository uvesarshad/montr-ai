import { it, expect } from 'vitest';

import {
  buildNewViewEditorState,
  buildViewEditorStateFromView,
} from './view-editor-state';

it('buildNewViewEditorState uses the first five columns for a new entity type', () => {
  const state = buildNewViewEditorState('company', [
    { field: 'industry', operator: 'equals', value: 'SaaS', conjunction: 'and' },
  ]);

  expect(state.selectedColumns).toEqual(['name', 'domain', 'industry', 'type', 'size']);
  expect(state.filters).toEqual([
    { field: 'industry', operator: 'equals', value: 'SaaS', conjunction: 'and' },
  ]);
});

it('buildViewEditorStateFromView keeps persisted columns and filters intact', () => {
  const state = buildViewEditorStateFromView({
    // @ts-expect-error
    _id: 'view-1',
    name: 'Hot Accounts',
    entityType: 'company',
    filters: [{ field: 'type', operator: 'equals', value: 'customer', conjunction: 'and' }],
    columns: ['name', 'type', 'dealCount'],
  });

  expect(state.selectedColumns).toEqual(['name', 'type', 'dealCount']);
  expect(state.filters).toEqual([
    { field: 'type', operator: 'equals', value: 'customer', conjunction: 'and' },
  ]);
});
