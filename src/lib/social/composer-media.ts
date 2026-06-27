export interface ComposerMediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  source: 'local' | 'library';
  altText?: string;
  assetId?: string;
}

interface CreateRemoteComposerMediaItemInput {
  id: string;
  url: string;
  type: 'image' | 'video';
  altText?: string;
  assetId?: string;
}

export function createRemoteComposerMediaItem({
  id,
  url,
  type,
  altText,
  assetId,
}: CreateRemoteComposerMediaItemInput): ComposerMediaItem {
  return {
    id,
    assetId,
    url,
    type,
    altText,
    source: 'library',
  };
}

export function removeComposerMedia(
  items: ComposerMediaItem[],
  id: string,
) {
  return items.filter((item) => item.id !== id);
}

export function moveComposerMedia(
  items: ComposerMediaItem[],
  id: string,
  direction: 'up' | 'down',
) {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    return items;
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export function buildComposerPublishMedia(
  items: ComposerMediaItem[],
  uploadedLocalUrls: Record<string, string>,
) {
  return items.map((item) => ({
    url:
      item.source === 'local'
        ? uploadedLocalUrls[item.id] || item.url
        : item.url,
    type: item.type,
    altText: item.altText,
  }));
}
