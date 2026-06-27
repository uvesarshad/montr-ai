import { it, expect } from 'vitest';

import { getPrimaryPublishMedia } from './publish-media';

it('returns first facebook media item when it is remotely hosted', () => {
  expect(getPrimaryPublishMedia([{ url: 'https://cdn.example.com/image.jpg', type: 'image' }], 'facebook')).toEqual({ url: 'https://cdn.example.com/image.jpg', type: 'image' });
});

it('rejects instagram video publishing in the current flow', () => {
  expect(() => getPrimaryPublishMedia([{ url: 'https://cdn.example.com/video.mp4', type: 'video' }], 'instagram')).toThrow(/image posts only/);
});

it('rejects non-public instagram media urls', () => {
  expect(() => getPrimaryPublishMedia([{ url: 'data:image/png;base64,abc', type: 'image' }], 'instagram')).toThrow(/must be uploaded/);
});
