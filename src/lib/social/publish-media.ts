export type PublishMediaPlatform = 'facebook' | 'instagram';

export interface PublishMediaItem {
  url: string;
  type: 'image' | 'video';
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function getPrimaryPublishMedia(
  items: PublishMediaItem[],
  platform: PublishMediaPlatform,
): PublishMediaItem | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const first = items[0];

  if (platform === 'instagram') {
    if (first.type !== 'image') {
      throw new Error('Instagram currently supports image posts only.');
    }

    if (!isHttpUrl(first.url)) {
      throw new Error('Instagram media must be uploaded before publishing.');
    }
  }

  if (platform === 'facebook' && !isHttpUrl(first.url)) {
    throw new Error('Facebook media must be uploaded before publishing.');
  }

  return first;
}
