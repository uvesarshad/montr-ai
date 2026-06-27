export interface MediaLibraryAsset {
  _id: string;
  type: 'image' | 'video';
  size: number;
  usageCount: number;
  createdAt: string;
  tags: string[];
  originalName: string;
  folderId?: string | null;
}

export interface TagSummaryItem {
  tag: string;
  count: number;
}

interface UploadFileLike {
  name: string;
  type: string;
  size: number;
}

interface UploadDimensions {
  width?: number;
  height?: number;
}

interface BrandMediaStorageFolderInput {
  brandId: string;
  brandHandle?: string;
}

interface StorageFileLike {
  key: string;
  url: string;
  name: string;
  size: number;
  contentType: string;
  lastModified: Date;
}

interface BuildCreateMediaAssetPayloadInput {
  brandId: string;
  file: UploadFileLike;
  uploadedUrl: string;
  folderId?: string | null;
  tags: string[];
  altText?: string;
  dimensions?: UploadDimensions;
  duration?: number;
}

export type MediaAssetSort =
  | 'newest'
  | 'oldest'
  | 'largest'
  | 'smallest'
  | 'most-used'
  | 'name';

interface RecentAssetOptions {
  now?: Date;
  days: number;
}

export function parseMediaTags(value: string) {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
}

export function getBrandMediaStorageFolder({
  brandId,
  brandHandle,
}: BrandMediaStorageFolderInput) {
  const normalizedHandle = (brandHandle || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim();

  return ['MontrAI', 'Social', normalizedHandle, brandId].filter(Boolean).join(' ');
}

export function filterImportableStorageFiles<T extends StorageFileLike>(files: T[]) {
  return files.filter(
    (file) =>
      file.contentType.startsWith('image/') ||
      file.contentType.startsWith('video/'),
  );
}

export function buildCreateMediaAssetPayload({
  brandId,
  file,
  uploadedUrl,
  folderId,
  tags,
  altText,
  dimensions,
  duration,
}: BuildCreateMediaAssetPayloadInput) {
  const url = new URL(uploadedUrl);
  const filename = decodeURIComponent(url.pathname.split('/').pop() || file.name);

  return {
    brandId,
    url: uploadedUrl,
    type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    filename,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    width: dimensions?.width,
    height: dimensions?.height,
    duration,
    folderId: folderId || undefined,
    tags,
    altText,
  };
}

export function buildTagSummary<T extends Pick<MediaLibraryAsset, 'tags'>>(
  assets: T[],
): TagSummaryItem[] {
  const counts = new Map<string, number>();

  for (const asset of assets) {
    for (const tag of asset.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.tag.localeCompare(right.tag);
    });
}

export function calculateSelectionSummary<T extends Pick<MediaLibraryAsset, '_id' | 'size'>>(
  assets: T[],
  selectedIds: Set<string>,
) {
  let count = 0;
  let totalSize = 0;

  for (const asset of assets) {
    if (!selectedIds.has(asset._id)) {
      continue;
    }

    count += 1;
    totalSize += asset.size;
  }

  return { count, totalSize };
}

export function countRecentAssets<T extends Pick<MediaLibraryAsset, 'createdAt'>>(
  assets: T[],
  { now = new Date(), days }: RecentAssetOptions,
) {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;

  return assets.filter((asset) => new Date(asset.createdAt).getTime() >= cutoff)
    .length;
}

export function sortMediaAssets<T extends MediaLibraryAsset>(
  assets: T[],
  sortBy: MediaAssetSort,
): T[] {
  return [...assets].sort((left, right) => {
    switch (sortBy) {
      case 'oldest':
        return (
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        );
      case 'largest':
        return right.size - left.size;
      case 'smallest':
        return left.size - right.size;
      case 'most-used':
        if (right.usageCount !== left.usageCount) {
          return right.usageCount - left.usageCount;
        }
        return (
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        );
      case 'name':
        return left.originalName.localeCompare(right.originalName);
      case 'newest':
      default:
        return (
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        );
    }
  });
}
