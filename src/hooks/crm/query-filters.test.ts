import { it, expect } from 'vitest';

import {
  buildFavoriteQueryString,
  buildViewQueryString,
} from './query-filters';

it('buildFavoriteQueryString serializes favorite filters without noise', () => {
  expect(buildFavoriteQueryString({ targetType: 'contact' })).toBe('targetType=contact');
  expect(buildFavoriteQueryString({ targetType: 'contact', folderId: 'folder-1' })).toBe('targetType=contact&folderId=folder-1');
  expect(buildFavoriteQueryString({})).toBe('');
});

it('buildViewQueryString serializes only defined view filters in stable order', () => {
  expect(buildViewQueryString({ entityType: 'contact' })).toBe('entityType=contact');
  expect(buildViewQueryString({ entityType: 'contact', visibility: 'team', isPinned: false })).toBe('entityType=contact&visibility=team&isPinned=false');
  expect(buildViewQueryString({})).toBe('');
});
