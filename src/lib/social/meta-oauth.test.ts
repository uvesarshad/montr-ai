import { it, expect } from 'vitest';

import {
  extractFacebookAssets,
  extractInstagramAssets,
  extractMetaAssets,
} from './meta-oauth';

it('extractFacebookAssets returns selectable pages with page tokens', () => {
  const assets = extractFacebookAssets({
    data: [
      {
        id: 'page_1',
        name: 'Montr AI',
        access_token: 'page_token_1',
        picture: { data: { url: 'https://example.com/page.jpg' } },
      },
      {
        id: 'page_2',
        name: 'No Token Page',
      },
    ],
  });

  expect(assets).toEqual([
    {
      id: 'page_1',
      platform: 'facebook',
      displayName: 'Montr AI',
      username: 'montrai',
      avatarUrl: 'https://example.com/page.jpg',
      accessToken: 'page_token_1',
      pageId: 'page_1',
      pageName: 'Montr AI',
    },
  ]);
});

it('extractInstagramAssets returns only linked Instagram business accounts', () => {
  const assets = extractInstagramAssets({
    data: [
      {
        id: 'page_1',
        name: 'Montr AI',
        access_token: 'page_token_1',
        instagram_business_account: {
          id: 'ig_1',
          username: 'montr.io',
          name: 'Montr on Instagram',
          profile_picture_url: 'https://example.com/ig.jpg',
        },
      },
      {
        id: 'page_2',
        name: 'No Instagram',
        access_token: 'page_token_2',
      },
    ],
  });

  expect(assets).toEqual([
    {
      id: 'ig_1',
      platform: 'instagram',
      displayName: 'Montr on Instagram',
      username: 'montr.io',
      avatarUrl: 'https://example.com/ig.jpg',
      accessToken: 'page_token_1',
      pageId: 'page_1',
      pageName: 'Montr AI',
    },
  ]);
});

it('extractMetaAssets dispatches by platform', () => {
  expect(extractMetaAssets('facebook', { data: [] }).length).toBe(0);
  expect(extractMetaAssets('instagram', { data: [] }).length).toBe(0);
});
