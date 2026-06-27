
import { it, expect } from 'vitest';
import { getSortedLinkableResources } from './resource-linking';

it('getSortedLinkableResources excludes the current resource and sorts newest first', () => {
  const result = getSortedLinkableResources(
    [
      { _id: 'a', title: 'Alpha', updatedAt: '2026-03-20T10:00:00.000Z' },
      { _id: 'b', title: 'Beta', updatedAt: '2026-03-22T10:00:00.000Z' },
      { _id: 'c', title: 'Gamma', updatedAt: '2026-03-21T10:00:00.000Z' },
    ],
    'b'
  );

  expect(result.map((item) => item._id)).toEqual(['c', 'a']);
});

it('getSortedLinkableResources falls back to title sorting when updatedAt is missing', () => {
  const result = getSortedLinkableResources([
    { _id: 'b', title: 'Beta' },
    { _id: 'a', title: 'Alpha' },
  ]);

  expect(result.map((item) => item._id)).toEqual(['a', 'b']);
});
