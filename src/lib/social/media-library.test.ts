import { it, expect } from 'vitest';

import {
  buildCreateMediaAssetPayload,
  filterImportableStorageFiles,
  getBrandMediaStorageFolder,
  buildTagSummary,
  calculateSelectionSummary,
  countRecentAssets,
  parseMediaTags,
  sortMediaAssets,
  type MediaLibraryAsset,
} from './media-library';

const assets: MediaLibraryAsset[] = [
  {
    _id: 'asset-1',
    type: 'image',
    size: 1024,
    usageCount: 4,
    createdAt: '2026-03-14T10:00:00.000Z',
    tags: ['launch', 'brand'],
    originalName: 'launch-cover.png',
  },
  {
    _id: 'asset-2',
    type: 'video',
    size: 4096,
    usageCount: 1,
    createdAt: '2026-03-10T10:00:00.000Z',
    tags: ['product'],
    originalName: 'walkthrough.mp4',
  },
  {
    _id: 'asset-3',
    type: 'image',
    size: 2048,
    usageCount: 9,
    createdAt: '2026-03-01T10:00:00.000Z',
    tags: ['launch', 'campaign'],
    originalName: 'campaign-still.png',
  },
];

it('buildTagSummary ranks tags by frequency and then alphabetically', () => {
  const result = buildTagSummary(assets);

  expect(result).toEqual([
    { tag: 'launch', count: 2 },
    { tag: 'brand', count: 1 },
    { tag: 'campaign', count: 1 },
    { tag: 'product', count: 1 },
  ]);
});

it('calculateSelectionSummary totals selected assets and bytes', () => {
  const result = calculateSelectionSummary(assets, new Set(['asset-1', 'asset-3']));

  expect(result).toEqual({
    count: 2,
    totalSize: 3072,
  });
});

it('countRecentAssets limits to the requested lookback window', () => {
  const result = countRecentAssets(assets, {
    now: new Date('2026-03-14T12:00:00.000Z'),
    days: 7,
  });

  expect(result).toBe(2);
});

it('sortMediaAssets orders by usage before falling back to newest first', () => {
  const result = sortMediaAssets(assets, 'most-used');

  expect(result.map((asset) => asset._id)).toEqual(['asset-3', 'asset-1', 'asset-2']);
});

it('sortMediaAssets orders alphabetically by original name', () => {
  const result = sortMediaAssets(assets, 'name');

  expect(result.map((asset) => asset._id)).toEqual(['asset-3', 'asset-1', 'asset-2']);
});

it('parseMediaTags trims, deduplicates, and removes empties', () => {
  const result = parseMediaTags(' launch, brand , ,launch, evergreen ');

  expect(result).toEqual(['launch', 'brand', 'evergreen']);
});

it('buildCreateMediaAssetPayload derives file metadata from upload data', () => {
  const result = buildCreateMediaAssetPayload({
    brandId: 'brand-1',
    file: {
      name: 'Launch Hero.png',
      type: 'image/png',
      size: 2048,
    },
    uploadedUrl: 'https://bucket.s3.region.wasabisys.com/171234-LaunchHero.png',
    folderId: 'folder-1',
    tags: ['launch', 'hero'],
    altText: 'Team at the product launch event',
    dimensions: {
      width: 1200,
      height: 628,
    },
  });

  expect(result).toEqual({
    brandId: 'brand-1',
    url: 'https://bucket.s3.region.wasabisys.com/171234-LaunchHero.png',
    type: 'image',
    filename: '171234-LaunchHero.png',
    originalName: 'Launch Hero.png',
    mimeType: 'image/png',
    size: 2048,
    width: 1200,
    height: 628,
    duration: undefined,
    folderId: 'folder-1',
    tags: ['launch', 'hero'],
    altText: 'Team at the product launch event',
  });
});

it('buildCreateMediaAssetPayload classifies videos and allows root folder', () => {
  const result = buildCreateMediaAssetPayload({
    brandId: 'brand-2',
    file: {
      name: 'walkthrough.mp4',
      type: 'video/mp4',
      size: 8192,
    },
    uploadedUrl: 'https://bucket.s3.region.wasabisys.com/uploads/video.mp4',
    folderId: null,
    tags: [],
    altText: '',
    duration: 12,
  });

  expect(result.type).toBe('video');
  expect(result.folderId).toBe(undefined);
  expect(result.duration).toBe(12);
});

it('getBrandMediaStorageFolder keeps names stable and brand-specific', () => {
  expect(getBrandMediaStorageFolder({ brandId: 'brand-123', brandHandle: 'acme.co' })).toBe('MontrAI Social acmeco brand-123');
});

it('filterImportableStorageFiles keeps only image and video files', () => {
  const result = filterImportableStorageFiles([
    {
      key: '1',
      url: 'https://example.com/hero.png',
      name: 'hero.png',
      size: 100,
      contentType: 'image/png',
      lastModified: new Date('2026-03-15T10:00:00.000Z'),
    },
    {
      key: '2',
      url: 'https://example.com/notes.pdf',
      name: 'notes.pdf',
      size: 200,
      contentType: 'application/pdf',
      lastModified: new Date('2026-03-15T10:00:00.000Z'),
    },
    {
      key: '3',
      url: 'https://example.com/clip.mp4',
      name: 'clip.mp4',
      size: 300,
      contentType: 'video/mp4',
      lastModified: new Date('2026-03-15T10:00:00.000Z'),
    },
  ]);

  expect(result.map((file) => file.key)).toEqual(['1', '3']);
});
