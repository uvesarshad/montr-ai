import { it, expect } from 'vitest';

import { getCreatePostSummaryState } from './create-post-summary';

it('getCreatePostSummaryState returns a compact ready state when collapsed', () => {
  const result = getCreatePostSummaryState({
    isExpanded: false,
    blockersCount: 0,
    warningsCount: 0,
  });

  expect(result).toEqual({
    toggleLabel: 'Show composer summary',
    helperText: 'Ready for drafting',
    tone: 'ready',
  });
});

it('getCreatePostSummaryState prioritizes blockers over warnings', () => {
  const result = getCreatePostSummaryState({
    isExpanded: true,
    blockersCount: 2,
    warningsCount: 1,
  });

  expect(result).toEqual({
    toggleLabel: 'Hide composer summary',
    helperText: '3 items need attention',
    tone: 'critical',
  });
});
