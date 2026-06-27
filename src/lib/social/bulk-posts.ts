export type BulkPostFormat = 'standard' | 'reel';

export interface BulkPostRowInput {
  content?: string;
  scheduledFor?: string;
  mediaUrls?: string;
  channels?: string;
  postFormat?: string;
  altText?: string;
}

export interface BulkPostRow {
  content: string;
  scheduledFor: string;
  mediaUrls: string[];
  channels: string[];
  postFormat: BulkPostFormat;
  altText: string;
}

export interface BulkPostDraftRow {
  id: string;
  content: string;
  scheduledFor: string;
  mediaUrls: string;
  channels: string;
  postFormat: BulkPostFormat;
  altText: string;
}

export interface BulkPostDraftPersistenceState {
  bulkRows: BulkPostDraftRow[];
  selectedAccountIds: string[];
  selectedTelegramChannels: Record<string, string[]>;
  bulkImportName: string;
}

export interface BulkChannelAccount {
  _id: string;
  platform: string;
  platformUsername: string;
  platformDisplayName?: string;
}

export function inferBulkMediaType(url: string): 'image' | 'video' {
  return /\.(mp4|mov|m4v|webm|avi)$/i.test(url) ? 'video' : 'image';
}

export function createInitialBulkPostDraftRows(count = 3): BulkPostDraftRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `bulk-row-${index + 1}`,
    content: '',
    scheduledFor: '',
    mediaUrls: '',
    channels: '',
    postFormat: 'standard',
    altText: '',
  }));
}

function normalizeBulkDraftRow(row: unknown, index: number): BulkPostDraftRow | null {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const candidate = row as Partial<BulkPostDraftRow>;

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id
      : `bulk-row-${index + 1}`,
    content: typeof candidate.content === 'string' ? candidate.content : '',
    scheduledFor: typeof candidate.scheduledFor === 'string' ? candidate.scheduledFor : '',
    mediaUrls: typeof candidate.mediaUrls === 'string' ? candidate.mediaUrls : '',
    channels: typeof candidate.channels === 'string' ? candidate.channels : '',
    postFormat: candidate.postFormat === 'reel' ? 'reel' : 'standard',
    altText: typeof candidate.altText === 'string' ? candidate.altText : '',
  };
}

export function createBulkDraftPersistenceState(
  input?: Partial<BulkPostDraftPersistenceState>,
): BulkPostDraftPersistenceState {
  const normalizedRows = Array.isArray(input?.bulkRows)
    ? input.bulkRows.reduce<BulkPostDraftRow[]>((acc, row, index) => {
        const normalized = normalizeBulkDraftRow(row, index);
        if (normalized) acc.push(normalized);
        return acc;
      }, [])
    : [];

  const nextRows = [...normalizedRows];
  while (nextRows.length < 3) {
    nextRows.push(createInitialBulkPostDraftRows(1)[0]!);
    nextRows[nextRows.length - 1]!.id = `bulk-row-${nextRows.length}`;
  }

  return {
    bulkRows: nextRows,
    selectedAccountIds: Array.isArray(input?.selectedAccountIds)
      ? input.selectedAccountIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
    selectedTelegramChannels:
      input?.selectedTelegramChannels && typeof input.selectedTelegramChannels === 'object'
        ? Object.fromEntries(
            Object.entries(input.selectedTelegramChannels).flatMap(([accountId, chatIds]) => {
              if (typeof accountId !== 'string' || !Array.isArray(chatIds)) {
                return [];
              }

              const nextChatIds = chatIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
              return [[accountId, nextChatIds]];
            }),
          )
        : {},
    bulkImportName: typeof input?.bulkImportName === 'string' ? input.bulkImportName : '',
  };
}

export function parseBulkDraftPersistenceState(raw: string | null): BulkPostDraftPersistenceState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { bulkRows?: unknown }).bulkRows)) {
      return null;
    }

    return createBulkDraftPersistenceState(parsed as Partial<BulkPostDraftPersistenceState>);
  } catch {
    return null;
  }
}

export function getNextBulkDraftRowCounter(rows: BulkPostDraftRow[]): number {
  const highestRowNumber = rows.reduce((highest, row) => {
    const match = /^bulk-row-(\d+)$/.exec(row.id);
    const rowNumber = match ? Number.parseInt(match[1] || '0', 10) : 0;
    return Number.isNaN(rowNumber) ? highest : Math.max(highest, rowNumber);
  }, 0);

  return highestRowNumber + 1;
}

export function getBulkDraftStorageKey(brandId: string): string {
  return `social.bulk-posts.draft.${brandId}`;
}

export function convertBulkPostRowsToDrafts(rows: BulkPostRow[]): BulkPostDraftRow[] {
  return rows.map((row, index) => ({
    id: `bulk-row-${index + 1}`,
    content: row.content,
    scheduledFor: row.scheduledFor,
    mediaUrls: row.mediaUrls.join(', '),
    channels: row.channels.join(', '),
    postFormat: row.postFormat,
    altText: row.altText,
  }));
}

export function matchBulkChannels(
  channelTokens: string[],
  accounts: BulkChannelAccount[],
): string[] {
  const normalizedTokens = channelTokens.map((token) => token.trim().toLowerCase()).filter(Boolean);

  return accounts
    .filter((account) => {
      const candidates = [
        account._id,
        account.platform,
        account.platformUsername,
        `@${account.platformUsername}`,
        account.platformDisplayName || '',
      ].map((value) => value.toLowerCase());

      return normalizedTokens.some((token) => candidates.includes(token));
    })
    .map((account) => account._id);
}

export function normalizeBulkPostRows(
  rows: BulkPostRowInput[],
  options?: { requireScheduledFor?: boolean },
): BulkPostRow[] {
  const requireScheduledFor = options?.requireScheduledFor ?? true;

  return rows
    .map((row) => {
      const content = row.content?.trim() || '';
      const scheduledFor = row.scheduledFor?.trim() || '';
      const mediaUrls = (row.mediaUrls || '')
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean);
      const channels = (row.channels || '')
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean);
      const postFormat: BulkPostFormat = row.postFormat?.trim().toLowerCase() === 'reel'
        ? 'reel'
        : 'standard';
      const altText = row.altText?.trim() || '';

      return {
        content,
        scheduledFor,
        mediaUrls,
        channels,
        postFormat,
        altText,
      };
    })
    .filter((row) => row.content && (!requireScheduledFor || row.scheduledFor));
}

export function getInstagramPublishMode({
  mediaType,
  postFormat,
}: {
  mediaType: 'image' | 'video';
  postFormat: BulkPostFormat;
}) {
  if (mediaType === 'video' && postFormat !== 'reel') {
    throw new Error('Instagram video publishing requires reel format.');
  }

  if (mediaType === 'video') {
    return {
      apiMediaType: 'REELS',
      mediaField: 'video_url',
      captionField: 'caption',
    } as const;
  }

  return {
    apiMediaType: 'IMAGE',
    mediaField: 'image_url',
    captionField: 'caption',
  } as const;
}

export function getUnsupportedVideoPublishMessage(platform: string): string | null {
  switch (platform) {
    case 'linkedin':
      return 'LinkedIn video publishing is not supported in the current flow yet.';
    case 'facebook':
      return 'Facebook video publishing is not supported in the current flow yet.';
    case 'dribbble':
      return 'Dribbble video publishing is not supported.';
    default:
      return null;
  }
}
