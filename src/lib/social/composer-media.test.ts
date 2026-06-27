import { it, expect } from 'vitest';

import {
  buildComposerPublishMedia,
  createRemoteComposerMediaItem,
  moveComposerMedia,
  removeComposerMedia,
  type ComposerMediaItem,
} from './composer-media';

const mediaItems: ComposerMediaItem[] = [
  {
    id: 'local-1',
    url: 'blob:local-1',
    type: 'image',
    source: 'local',
    altText: 'Local first',
  },
  {
    id: 'library-1',
    url: 'https://cdn.example.com/library.jpg',
    type: 'image',
    source: 'library',
    altText: 'Library second',
  },
  {
    id: 'local-2',
    url: 'blob:local-2',
    type: 'image',
    source: 'local',
  },
];

it('removeComposerMedia drops the requested item and keeps order', () => {
  const result = removeComposerMedia(mediaItems, 'library-1');

  expect(result.map((item) => item.id)).toEqual(['local-1', 'local-2']);
});

it('moveComposerMedia reorders items up and down', () => {
  const movedUp = moveComposerMedia(mediaItems, 'library-1', 'up');
  expect(movedUp.map((item) => item.id)).toEqual(['library-1', 'local-1', 'local-2']);

  const movedDown = moveComposerMedia(mediaItems, 'local-1', 'down');
  expect(movedDown.map((item) => item.id)).toEqual(['library-1', 'local-1', 'local-2']);
});

it('buildComposerPublishMedia preserves order and swaps uploaded local urls', () => {
  const result = buildComposerPublishMedia(mediaItems, {
    'local-1': 'https://cdn.example.com/uploaded-1.jpg',
    'local-2': 'https://cdn.example.com/uploaded-2.jpg',
  });

  expect(result).toEqual([
    {
      url: 'https://cdn.example.com/uploaded-1.jpg',
      type: 'image',
      altText: 'Local first',
    },
    {
      url: 'https://cdn.example.com/library.jpg',
      type: 'image',
      altText: 'Library second',
    },
    {
      url: 'https://cdn.example.com/uploaded-2.jpg',
      type: 'image',
      altText: undefined,
    },
  ]);
});

it('createRemoteComposerMediaItem normalizes remote files for the composer', () => {
  const result = createRemoteComposerMediaItem({
    id: 'drive-file-1',
    url: 'https://drive.google.com/uc?id=abc123',
    type: 'image',
    altText: 'Drive image',
    assetId: 'asset-1',
  });

  expect(result).toEqual({
    id: 'drive-file-1',
    assetId: 'asset-1',
    url: 'https://drive.google.com/uc?id=abc123',
    type: 'image',
    altText: 'Drive image',
    source: 'library',
  });
});
