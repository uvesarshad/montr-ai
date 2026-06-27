'use client';

import NextImage from 'next/image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarPlus,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Film,
  ImagePlus,
  Instagram,
  LayoutGrid,
  Loader2,
  PencilLine,
  Plus,
  Send,
  Trash2,
  Upload,
  Wand2,
  X,
  XCircle,
  Youtube,
} from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Button, Chip as KitChip } from '@/components/ui-kit';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  createBulkDraftPersistenceState,
  convertBulkPostRowsToDrafts,
  createInitialBulkPostDraftRows,
  getBulkDraftStorageKey,
  getNextBulkDraftRowCounter,
  getUnsupportedVideoPublishMessage,
  inferBulkMediaType,
  matchBulkChannels,
  normalizeBulkPostRows,
  parseBulkDraftPersistenceState,
  type BulkPostDraftRow,
} from '@/lib/social/bulk-posts';
import {
  DribbbleLogo,
  FacebookLogo,
  GoogleBusinessLogo,
  LinkedinLogo,
  RedditLogo,
  TelegramLogo,
  ThreadsLogo,
  XLogo,
} from '@/components/social-icons';

interface Brand {
  _id: string;
  name: string;
  handle: string;
}

interface TelegramChannel {
  chatId: string;
  title: string;
  type: 'channel' | 'group' | 'supergroup';
}

interface SocialAccount {
  _id: string;
  platform: string;
  platformUsername: string;
  platformDisplayName?: string;
  isActive: boolean;
  telegramChannels?: TelegramChannel[];
}

interface LibraryMediaAsset {
  _id: string;
  url: string;
  thumbnailUrl?: string;
  type: 'image' | 'video';
  originalName: string;
  altText?: string;
}

type Platform =
  | 'instagram'
  | 'linkedin'
  | 'x'
  | 'facebook'
  | 'youtube'
  | 'reddit'
  | 'telegram'
  | 'google_business'
  | 'dribbble'
  | 'threads';

const platformConfig: Record<
  Platform,
  { name: string; icon: React.ElementType; color: string; bg: string }
> = {
  instagram: { name: 'Instagram', icon: Instagram, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  linkedin: { name: 'LinkedIn', icon: LinkedinLogo, color: 'text-blue-600', bg: 'bg-blue-600/10' },
  x: { name: 'X', icon: XLogo, color: 'text-foreground', bg: 'bg-foreground/10' },
  facebook: { name: 'Facebook', icon: FacebookLogo, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  youtube: { name: 'YouTube', icon: Youtube, color: 'text-red-500', bg: 'bg-red-500/10' },
  reddit: { name: 'Reddit', icon: RedditLogo, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  telegram: { name: 'Telegram', icon: TelegramLogo, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  google_business: { name: 'Google Business', icon: GoogleBusinessLogo, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  dribbble: { name: 'Dribbble', icon: DribbbleLogo, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  threads: { name: 'Threads', icon: ThreadsLogo, color: 'text-foreground', bg: 'bg-foreground/10' },
};

function formatSchedulePreview(value: string) {
  if (!value) {
    return 'Leave empty to publish immediately.';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid schedule time';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

export default function BulkCreatePostsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedTelegramChannels, setSelectedTelegramChannels] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [areAccountsReady, setAreAccountsReady] = useState(false);

  const [bulkRows, setBulkRows] = useState<BulkPostDraftRow[]>(() => createInitialBulkPostDraftRows());
  const [bulkImportName, setBulkImportName] = useState('');
  const [isBulkScheduling, setIsBulkScheduling] = useState(false);
  const [isBulkPublishing, setIsBulkPublishing] = useState(false);
  const [enhancingRows, setEnhancingRows] = useState<Record<string, boolean>>({});
  const [uploadingMediaRows, setUploadingMediaRows] = useState<Record<string, boolean>>({});
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [activeMediaRowId, setActiveMediaRowId] = useState<string | null>(null);
  const [libraryAssets, setLibraryAssets] = useState<LibraryMediaAsset[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [hydratedDraftBrandId, setHydratedDraftBrandId] = useState<string | null>(null);

  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const bulkUploadInputRef = useRef<HTMLInputElement>(null);
  const bulkRowCounterRef = useRef(4);

  const { toast } = useToast();
  const { data: session } = useSession();
  const { push } = useRouter();
  const searchParams = useSearchParams();

  const createBulkDraftRow = useCallback((): BulkPostDraftRow => ({
    id: `bulk-row-${bulkRowCounterRef.current++}`,
    content: '',
    scheduledFor: '',
    mediaUrls: '',
    channels: '',
    postFormat: 'standard',
    altText: '',
  }), []);

  const ensureMinimumBulkRows = useCallback((rows: BulkPostDraftRow[]) => {
    const nextRows = [...rows];
    while (nextRows.length < 3) {
      nextRows.push(createBulkDraftRow());
    }
    return nextRows;
  }, [createBulkDraftRow]);

  const resetBulkWorkspace = useCallback((brandId?: string) => {
    const nextDraft = createBulkDraftPersistenceState();
    bulkRowCounterRef.current = getNextBulkDraftRowCounter(nextDraft.bulkRows);
    setBulkRows(nextDraft.bulkRows);
    setBulkImportName(nextDraft.bulkImportName);
    setSelectedAccountIds(nextDraft.selectedAccountIds);
    setSelectedTelegramChannels(nextDraft.selectedTelegramChannels);
    setActiveMediaRowId(null);
    setLibraryDialogOpen(false);

    if (brandId) {
      localStorage.removeItem(getBulkDraftStorageKey(brandId));
    }
  }, []);

  useEffect(() => {
    async function fetchBrands() {
      try {
        const response = await fetch('/api/social/brands');
        if (!response.ok) {
          throw new Error('Failed to load brands');
        }

        const data = await response.json();
        const nextBrands = data.brands || [];
        setBrands(nextBrands);

        if (nextBrands.length > 0) {
          const brandFromQuery = searchParams.get('brandId');
          const lastBrand = localStorage.getItem('lastSelectedBrandId');
          const preferredBrand = [brandFromQuery, lastBrand, nextBrands[0]?._id].find((brandId) =>
            brandId && nextBrands.some((brand: Brand) => brand._id === brandId),
          );
          if (preferredBrand) {
            setSelectedBrandId(preferredBrand);
          }
        }
      } catch (error) {
        console.error('Failed to fetch brands:', error);
        toast({ variant: 'destructive', title: 'Failed to load brands' });
      } finally {
        setIsLoading(false);
      }
    }

    fetchBrands();
  }, [searchParams, toast]);

  useEffect(() => {
    if (selectedBrandId) {
      localStorage.setItem('lastSelectedBrandId', selectedBrandId);
    }
  }, [selectedBrandId]);

  useEffect(() => {
    if (!selectedBrandId) {
      setHydratedDraftBrandId(null);
      resetBulkWorkspace();
      return;
    }

    setHydratedDraftBrandId(null);
    const savedDraft = parseBulkDraftPersistenceState(
      localStorage.getItem(getBulkDraftStorageKey(selectedBrandId)),
    );
    const nextDraft = savedDraft ?? createBulkDraftPersistenceState();

    bulkRowCounterRef.current = getNextBulkDraftRowCounter(nextDraft.bulkRows);
    setBulkRows(nextDraft.bulkRows);
    setBulkImportName(nextDraft.bulkImportName);
    setSelectedAccountIds(nextDraft.selectedAccountIds);
    setSelectedTelegramChannels(nextDraft.selectedTelegramChannels);
    setHydratedDraftBrandId(selectedBrandId);
  }, [resetBulkWorkspace, selectedBrandId]);

  useEffect(() => {
    async function fetchAccounts() {
      if (!selectedBrandId) {
        setAccounts([]);
        setSelectedAccountIds([]);
        setSelectedTelegramChannels({});
        setAreAccountsReady(false);
        return;
      }

      setAreAccountsReady(false);
      setAccounts([]);
      try {
        const response = await fetch(`/api/social/brands/${selectedBrandId}/accounts`);
        if (!response.ok) {
          throw new Error('Failed to load accounts');
        }

        const data = await response.json();
        setAccounts(data.accounts || []);
        setAreAccountsReady(true);
      } catch (error) {
        console.error('Failed to fetch accounts:', error);
        toast({ variant: 'destructive', title: 'Failed to load social accounts' });
      }
    }

    fetchAccounts();
  }, [selectedBrandId, toast]);

  useEffect(() => {
    if (!selectedBrandId || !areAccountsReady) {
      return;
    }

    const validAccountIds = new Set(accounts.map((account) => account._id));
    const telegramChannelsByAccount = new Map(
      accounts
        .filter((account) => account.platform === 'telegram')
        .map((account) => [
          account._id,
          new Set((account.telegramChannels || []).map((channel) => channel.chatId)),
        ]),
    );

    setSelectedAccountIds((prev) => prev.filter((accountId) => validAccountIds.has(accountId)));
    setSelectedTelegramChannels((prev) =>
      Object.fromEntries(
        Object.entries(prev).flatMap(([accountId, chatIds]) => {
          if (!validAccountIds.has(accountId)) {
            return [];
          }

          const allowedChatIds = telegramChannelsByAccount.get(accountId);
          if (!allowedChatIds) {
            return [];
          }

          const nextChatIds = chatIds.filter((chatId) => allowedChatIds.has(chatId));
          return [[accountId, nextChatIds]];
        }),
      ),
    );
  }, [accounts, areAccountsReady, selectedBrandId]);

  useEffect(() => {
    if (!selectedBrandId || hydratedDraftBrandId !== selectedBrandId) {
      return;
    }

    const nextDraft = createBulkDraftPersistenceState({
      bulkRows,
      selectedAccountIds,
      selectedTelegramChannels,
      bulkImportName,
    });

    bulkRowCounterRef.current = getNextBulkDraftRowCounter(nextDraft.bulkRows);
    localStorage.setItem(getBulkDraftStorageKey(selectedBrandId), JSON.stringify(nextDraft));
  }, [
    bulkImportName,
    bulkRows,
    hydratedDraftBrandId,
    selectedAccountIds,
    selectedBrandId,
    selectedTelegramChannels,
  ]);

  useEffect(() => {
    if (!libraryDialogOpen || !selectedBrandId) {
      return;
    }

    async function fetchLibraryAssets() {
      setIsLibraryLoading(true);
      try {
        const params = new URLSearchParams({
          brandId: selectedBrandId,
          limit: '100',
        });
        const response = await fetch(`/api/social/media?${params.toString()}`);
        if (!response.ok) {
          throw new Error('Failed to load media library');
        }

        const data = await response.json();
        setLibraryAssets(data.assets || []);
      } catch (error) {
        console.error('Failed to fetch media library:', error);
        toast({ variant: 'destructive', title: 'Failed to load media library' });
      } finally {
        setIsLibraryLoading(false);
      }
    }

    fetchLibraryAssets();
  }, [libraryDialogOpen, selectedBrandId, toast]);

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand._id === selectedBrandId),
    [brands, selectedBrandId],
  );

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selectedAccountIds.includes(account._id)),
    [accounts, selectedAccountIds],
  );

  const bulkPublishRows = useMemo(
    () => normalizeBulkPostRows(bulkRows, { requireScheduledFor: false }),
    [bulkRows],
  );

  const bulkScheduleRows = useMemo(
    () => normalizeBulkPostRows(bulkRows),
    [bulkRows],
  );

  const allAccountsSelected = accounts.length > 0 && selectedAccountIds.length === accounts.length;
  const activeMediaRow = useMemo(
    () => bulkRows.find((row) => row.id === activeMediaRowId) || null,
    [activeMediaRowId, bulkRows],
  );

  const toggleAccount = useCallback((accountId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId],
    );
  }, []);

  const handleSelectAllAccounts = useCallback(() => {
    setSelectedAccountIds(accounts.map((account) => account._id));
  }, [accounts]);

  const handleClearAccountSelection = useCallback(() => {
    setSelectedAccountIds([]);
  }, []);

  const resolveBulkRowAccounts = useCallback((channels: string[]) => {
    if (channels.length === 0) {
      return selectedAccounts;
    }

    const channelTokens = channels.map((value) => value.trim().toLowerCase());
    return accounts.filter((account) => {
      const candidates = [
        account._id,
        account.platform,
        account.platformUsername,
        `@${account.platformUsername}`,
        account.platformDisplayName || '',
      ].map((value) => value.toLowerCase());

      return channelTokens.some((token) => candidates.includes(token));
    });
  }, [accounts, selectedAccounts]);

  const updateBulkRow = useCallback((
    rowId: string,
    field: keyof Omit<BulkPostDraftRow, 'id'>,
    value: string,
  ) => {
    setBulkRows((prev) => prev.map((row) => (
      row.id === rowId ? { ...row, [field]: value } : row
    )));
  }, []);

  const addBulkRow = useCallback(() => {
    setBulkRows((prev) => [...prev, createBulkDraftRow()]);
  }, [createBulkDraftRow]);

  const removeBulkRow = useCallback((rowId: string) => {
    setBulkRows((prev) => ensureMinimumBulkRows(prev.filter((row) => row.id !== rowId)));
  }, [ensureMinimumBulkRows]);

  const getRowChannelIds = useCallback((row: BulkPostDraftRow) => (
    row.channels
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  ), []);

  const toggleRowChannel = useCallback((rowId: string, accountId: string) => {
    setBulkRows((prev) => prev.map((row) => {
      if (row.id !== rowId) {
        return row;
      }

      const currentIds = row.channels
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const nextIds = currentIds.includes(accountId)
        ? currentIds.filter((id) => id !== accountId)
        : [...currentIds, accountId];

      return {
        ...row,
        channels: nextIds.join(', '),
      };
    }));
  }, []);

  const openMediaLibraryForRow = useCallback((rowId: string) => {
    setActiveMediaRowId(rowId);
    setLibraryDialogOpen(true);
  }, []);

  const openMediaUploadForRow = useCallback((rowId: string) => {
    if (!selectedBrandId) {
      toast({ variant: 'destructive', title: 'Select a brand first' });
      return;
    }

    setActiveMediaRowId(rowId);
    bulkUploadInputRef.current?.click();
  }, [selectedBrandId, toast]);

  const clearRowMedia = useCallback((rowId: string) => {
    setBulkRows((prev) => prev.map((row) => (
      row.id === rowId ? { ...row, mediaUrls: '', altText: row.altText } : row
    )));
  }, []);

  const selectMediaForRow = useCallback((asset: LibraryMediaAsset) => {
    if (!activeMediaRowId) {
      return;
    }

    setBulkRows((prev) => prev.map((row) => (
      row.id === activeMediaRowId
        ? {
            ...row,
            mediaUrls: asset.url,
            altText: row.altText || asset.altText || '',
            postFormat: asset.type === 'video' ? 'reel' : row.postFormat,
          }
        : row
    )));
    setLibraryDialogOpen(false);
  }, [activeMediaRowId]);

  const handleMediaUploadForRow = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const rowId = activeMediaRowId;
    if (!file || !rowId || !selectedBrandId) {
      return;
    }

    setUploadingMediaRows((prev) => ({ ...prev, [rowId]: true }));
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/api/social/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadData.url) {
        throw new Error(uploadData.error || `Failed to upload ${file.name}`);
      }

      const type = file.type.startsWith('video/') ? 'video' as const : 'image' as const;
      const assetPayload = {
        brandId: selectedBrandId,
        url: uploadData.url,
        thumbnailUrl: type === 'image' ? uploadData.url : undefined,
        type,
        filename: `${Date.now()}-${file.name.replace(/\s+/g, '-')}`,
        originalName: file.name,
        mimeType: file.type || (type === 'video' ? 'video/mp4' : 'image/jpeg'),
        size: file.size,
        altText: '',
      };

      const createAssetResponse = await fetch('/api/social/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assetPayload),
      });
      const createAssetData = await createAssetResponse.json();
      if (!createAssetResponse.ok) {
        throw new Error(createAssetData.error || `Failed to save ${file.name}`);
      }

      const asset = createAssetData.asset as LibraryMediaAsset;
      setLibraryAssets((prev) => [asset, ...prev.filter((item) => item._id !== asset._id)]);
      selectMediaForRow(asset);
      toast({ title: 'Media uploaded', description: `${file.name} added to the library.` });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: getErrorMessage(error),
      });
    } finally {
      setUploadingMediaRows((prev) => ({ ...prev, [rowId]: false }));
      if (event.target) {
        event.target.value = '';
      }
    }
  }, [activeMediaRowId, selectMediaForRow, selectedBrandId, toast]);

  const enhanceBulkRow = useCallback(async (rowId: string) => {
    const row = bulkRows.find((item) => item.id === rowId);
    if (!row?.content.trim()) {
      toast({ variant: 'destructive', title: 'Add caption content first' });
      return;
    }

    const rowChannelIds = getRowChannelIds(row);
    const rowAccounts = rowChannelIds.length > 0
      ? accounts.filter((account) => rowChannelIds.includes(account._id))
      : selectedAccounts;
    const inferredPlatform = rowAccounts[0]?.platform || 'social media';

    setEnhancingRows((prev) => ({ ...prev, [rowId]: true }));
    try {
      const response = await fetch('/api/social/ai/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: row.content,
          platform: inferredPlatform,
          ...(selectedBrandId ? { brandId: selectedBrandId } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to enhance content');
      }

      setBulkRows((prev) => prev.map((item) => (
        item.id === rowId ? { ...item, content: data.enhancedContent } : item
      )));
      toast({ title: 'Caption enhanced' });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Enhance failed',
        description: getErrorMessage(error),
      });
    } finally {
      setEnhancingRows((prev) => ({ ...prev, [rowId]: false }));
    }
  }, [accounts, bulkRows, getRowChannelIds, selectedAccounts, selectedBrandId, toast]);

  const handleBulkFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = normalizeBulkPostRows(results.data as Record<string, string>[], { requireScheduledFor: false });
        const nextRows = convertBulkPostRowsToDrafts(rows).map((row) => ({
          ...row,
          channels: matchBulkChannels(
            row.channels.split(',').map((value) => value.trim()).filter(Boolean),
            accounts,
          ).join(', '),
        }));
        bulkRowCounterRef.current = nextRows.length + 1;
        setBulkRows(ensureMinimumBulkRows(nextRows));
        setBulkImportName(file.name);
        toast({
          title: 'Bulk file loaded',
          description: rows.length > 0
            ? `${rows.length} row${rows.length === 1 ? '' : 's'} loaded into the table.`
            : 'No valid rows were found in the file.',
        });
      },
      error: (error) => {
        toast({
          variant: 'destructive',
          title: 'Bulk import failed',
          description: error.message,
        });
      },
    });

    if (event.target) {
      event.target.value = '';
    }
  }, [accounts, ensureMinimumBulkRows, toast]);

  const handleBulkSchedule = useCallback(async () => {
    if (!selectedBrandId) {
      toast({ variant: 'destructive', title: 'Select a brand first' });
      return;
    }
    if (bulkScheduleRows.length === 0) {
      toast({ variant: 'destructive', title: 'Add rows with content and a schedule time first' });
      return;
    }

    setIsBulkScheduling(true);
    let successCount = 0;
    const failures: string[] = [];

    try {
      for (const [index, row] of bulkScheduleRows.entries()) {
        const targetAccounts = resolveBulkRowAccounts(row.channels);
        if (targetAccounts.length === 0) {
          failures.push(`Row ${index + 1}: no matching channels found.`);
          continue;
        }

        const mediaTypes = row.mediaUrls.map((url) => inferBulkMediaType(url));

        if (mediaTypes[0] === 'video' && row.postFormat !== 'reel' && targetAccounts.some((account) => account.platform === 'instagram')) {
          failures.push(`Row ${index + 1}: Instagram video posts must use reel format.`);
          continue;
        }

        const response = await fetch('/api/social/posts/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bulk: true,
            brandId: selectedBrandId,
            content: row.content,
            mediaUrls: row.mediaUrls,
            mediaTypes,
            altText: row.altText || undefined,
            postFormat: row.postFormat,
            platforms: targetAccounts.map((account) => ({
              accountId: account._id,
              platform: account.platform,
              platformUsername: account.platformUsername,
              telegramChatIds: account.platform === 'telegram' ? (selectedTelegramChannels[account._id] || []) : undefined,
            })),
            scheduledFor: row.scheduledFor,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          failures.push(`Row ${index + 1}: ${data.error || 'Failed to schedule post.'}`);
          continue;
        }

        successCount += 1;
      }

      if (successCount > 0) {
        toast({
          title: 'Bulk schedule submitted',
          description: failures.length > 0
            ? `${successCount} row${successCount === 1 ? '' : 's'} scheduled or submitted, ${failures.length} failed.`
            : `${successCount} row${successCount === 1 ? '' : 's'} scheduled or submitted successfully.`,
        });
      }

      if (failures.length > 0) {
        toast({
          variant: 'destructive',
          title: 'Some rows could not be scheduled',
          description: failures[0],
        });
      }

      if (successCount === bulkScheduleRows.length && failures.length === 0) {
        resetBulkWorkspace(selectedBrandId);
        push('/social/calendar');
      }
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Bulk scheduling failed',
        description: getErrorMessage(error),
      });
    } finally {
      setIsBulkScheduling(false);
    }
  }, [bulkScheduleRows, resetBulkWorkspace, resolveBulkRowAccounts, push, selectedBrandId, selectedTelegramChannels, toast]);

  const handleBulkPublish = useCallback(async () => {
    if (bulkPublishRows.length === 0) {
      toast({ variant: 'destructive', title: 'Add at least one row with content before publishing' });
      return;
    }
    if (!session?.user) {
      toast({ variant: 'destructive', title: 'Not Authenticated', description: 'You must be logged in to publish posts.' });
      return;
    }

    setIsBulkPublishing(true);
    let successCount = 0;
    const failures: string[] = [];

    try {
      for (const [index, row] of bulkPublishRows.entries()) {
        const targetAccounts = resolveBulkRowAccounts(row.channels);
        if (targetAccounts.length === 0) {
          failures.push(`Row ${index + 1}: no matching channels found.`);
          continue;
        }

        const primaryMediaUrl = row.mediaUrls[0];
        const primaryMediaType = primaryMediaUrl ? inferBulkMediaType(primaryMediaUrl) : null;
        const unsupportedPlatform = targetAccounts.find((account) => {
          if (account.platform === 'instagram' && primaryMediaType === 'video' && row.postFormat !== 'reel') {
            return true;
          }

          return Boolean(
            primaryMediaType === 'video' &&
            getUnsupportedVideoPublishMessage(account.platform),
          );
        });

        if (unsupportedPlatform) {
          const platform = unsupportedPlatform.platform as Platform;
          failures.push(
            `Row ${index + 1} (${platformConfig[platform]?.name || platform}): ${
              platform === 'instagram' && primaryMediaType === 'video' && row.postFormat !== 'reel'
                ? 'Instagram video publishing requires reel format.'
                : getUnsupportedVideoPublishMessage(platform) || 'Unsupported platform.'
            }`,
          );
          continue;
        }

        const response = await fetch('/api/social/posts/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bulk: true,
            intent: 'publish',
            brandId: selectedBrandId,
            content: row.content,
            mediaUrls: row.mediaUrls,
            mediaTypes: primaryMediaType ? [primaryMediaType] : [],
            altText: row.altText || undefined,
            postFormat: row.postFormat,
            platforms: targetAccounts.map((account) => ({
              accountId: account._id,
              platform: account.platform,
              platformUsername: account.platformUsername,
              telegramChatIds: account.platform === 'telegram' ? (selectedTelegramChannels[account._id] || []) : undefined,
            })),
            scheduledFor: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          failures.push(`Row ${index + 1}: ${data.error || 'Failed to queue publish.'}`);
          continue;
        }

        successCount += 1;
      }

      if (successCount > 0) {
        toast({
          title: 'Bulk publish submitted',
          description: failures.length > 0
            ? `${successCount} row${successCount === 1 ? '' : 's'} queued or submitted, ${failures.length} failed.`
            : `${successCount} row${successCount === 1 ? '' : 's'} queued or submitted successfully.`,
        });
      }

      if (failures.length > 0) {
        toast({
          variant: 'destructive',
          title: 'Some rows could not be published',
          description: failures[0],
        });
      }

      if (successCount > 0 && failures.length === 0) {
        resetBulkWorkspace(selectedBrandId);
        push('/social/calendar');
      }
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Bulk publish failed',
        description: getErrorMessage(error),
      });
    } finally {
      setIsBulkPublishing(false);
    }
  }, [bulkPublishRows, resetBulkWorkspace, resolveBulkRowAccounts, push, selectedBrandId, selectedTelegramChannels, session, toast]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-6">
        <AlertCircle className="size-12 text-muted-foreground" />
        <h3 className="text-xl font-semibold">No Brands Set Up</h3>
        <p className="max-w-md text-center text-muted-foreground">
          Create a brand and connect social accounts before using bulk publish or scheduling.
        </p>
        <Button variant="brand" icon={Building2} onClick={() => push('/settings?tab=connections')}>
          Set Up Accounts
        </Button>
      </div>
    );
  }

  const bulkSecondaryActions = (
    <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => push('/social/create-post')}>
      Open composer
    </Button>
  );

  const bulkPrimaryAction = (
    <Button variant="brand" icon={isBulkScheduling ? Loader2 : CalendarPlus} onClick={handleBulkSchedule} disabled={isBulkScheduling || isBulkPublishing || bulkScheduleRows.length === 0}>
      {isBulkScheduling ? 'Scheduling…' : 'Schedule Batch'}
    </Button>
  );

  return (
    <ModuleShell
      title="Bulk planner"
      icon={PencilLine}
      editor
      breadcrumb={[{ label: 'Social', href: '/social' }, { label: 'Bulk planner' }]}
      primaryAction={bulkPrimaryAction}
      secondaryActions={bulkSecondaryActions}
      contentClassName="min-h-0 flex-1"
    >
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 pb-24">
      <Card className="overflow-hidden rounded-xl border border-border bg-card">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <KitChip tone="gray">Bulk workspace</KitChip>
                  <KitChip tone="brand">{bulkRows.length} editable rows</KitChip>
                </div>
                <div>
                  <p className="text-lg font-semibold">Publish or schedule at batch scale</p>
                  <p className="text-sm text-muted-foreground">
                    Keep the main composer clean. This workspace handles high-volume rows, channel routing, and CSV import in one place.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start">
                <input
                  ref={bulkFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  aria-label="Upload CSV file"
                  onChange={handleBulkFileChange}
                />
                <Button variant="outline" size="sm" icon={FileSpreadsheet} onClick={() => bulkFileInputRef.current?.click()}>
                  Upload CSV
                </Button>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border bg-background/70 px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Publish Ready</p>
                <p className="mt-1.5 text-xl font-semibold leading-none">{bulkPublishRows.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Rows with usable content.</p>
              </div>
              <div className="rounded-xl border bg-background/70 px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Schedule Ready</p>
                <p className="mt-1.5 text-xl font-semibold leading-none">{bulkScheduleRows.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Rows with content and time.</p>
              </div>
              <div className="rounded-xl border bg-background/70 px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">CSV Source</p>
                <p className="mt-1.5 truncate text-sm font-semibold leading-none">
                  {bulkImportName || 'Manual table'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Import when you need a head start.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_2.05fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden border-border">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="size-5 text-muted-foreground" />
                Brand
              </CardTitle>
              <CardDescription>
                Scope the batch first so account resolution stays clean.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand._id} value={brand._id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Current handle</p>
                <p className="mt-2 text-sm font-semibold">
                  {selectedBrand ? `@${selectedBrand.handle}` : 'Not selected'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <LayoutGrid className="size-5 text-muted-foreground" />
                    Target Accounts
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Rows without explicit channel tokens fall back to this selection.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" icon={CheckCircle2} onClick={handleSelectAllAccounts} disabled={accounts.length === 0 || allAccountsSelected}>
                    Select all
                  </Button>
                  <Button variant="ghost" size="sm" icon={XCircle} onClick={handleClearAccountSelection} disabled={selectedAccountIds.length === 0}>
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap gap-2">
                <KitChip tone="brand">{selectedAccountIds.length} selected</KitChip>
              </div>
              {accounts.length === 0 ? (
                <div className="rounded-2xl border border-dashed py-8 text-center text-muted-foreground">
                  No accounts connected to this brand.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {accounts.map((account) => {
                    const platform = account.platform as Platform;
                    const config = platformConfig[platform];
                    if (!config) return null;

                    const Icon = config.icon;
                    const isSelected = selectedAccountIds.includes(account._id);

                    return (
                      <button
                        key={account._id}
                        className={cn(
                          'group relative rounded-2xl border p-3 text-left transition-all',
                          isSelected
                            ? 'border-primary/40 bg-primary/5 shadow-sm'
                            : 'border-border/60 bg-background hover:border-primary/25 hover:bg-muted/40',
                        )}
                        type="button"
                        onClick={() => toggleAccount(account._id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', config.bg)}>
                            <Icon className={cn('size-3.5', config.color)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold leading-tight">
                              {account.platformDisplayName || `@${account.platformUsername}`}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">{config.name}</p>
                          </div>
                          {isSelected ? (
                            <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-3" />
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {accounts.filter((account) => account.platform === 'telegram' && selectedAccountIds.includes(account._id)).map((account) => (
                <div key={`channels-${account._id}`} className="rounded-lg border border-blue-400/20 bg-blue-400/5 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <TelegramLogo className="size-4 text-blue-400" />
                    <span className="text-sm font-medium">Select channels for @{account.platformUsername}</span>
                  </div>
                  {(!account.telegramChannels || account.telegramChannels.length === 0) ? (
                    <div className="text-sm text-muted-foreground">No channels configured for this bot.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {account.telegramChannels.map((channel) => {
                        const isChannelSelected = (selectedTelegramChannels[account._id] || []).includes(channel.chatId);
                        return (
                          <KitChip
                            key={channel.chatId}
                            tone={isChannelSelected ? 'info' : 'gray'}
                            selected={isChannelSelected}
                            icon={isChannelSelected ? Check : undefined}
                            onClick={() => {
                              setSelectedTelegramChannels((prev) => {
                                const current = prev[account._id] || [];
                                const updated = isChannelSelected
                                  ? current.filter((id) => id !== channel.chatId)
                                  : [...current, channel.chatId];
                                return { ...prev, [account._id]: updated };
                              });
                            }}
                          >
                            {channel.type === 'channel' ? '#' : ''}
                            {channel.title}
                          </KitChip>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-lg">Batch Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
              <p>Rows can target explicit channels, or use the selected accounts when the channel column is empty.</p>
              <p>Schedule time is only required for `Schedule Batch`.</p>
              <p className="flex items-start gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-muted-foreground">
                <Film className="mt-0.5 size-4" />
                Instagram video rows must use reel format. LinkedIn, Facebook, and Dribbble still block video publishing in the current flow.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden border-border">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileSpreadsheet className="size-5 text-muted-foreground" />
                  Batch Table
                </CardTitle>
                <CardDescription className="mt-1">
                  Keep the old popup flow, but give the batch editor room to breathe.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" icon={Plus} onClick={addBulkRow}>
                Add Row
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="overflow-hidden rounded-2xl border bg-background">
              <div className="max-h-[62vh] overflow-auto">
                <table className="w-full min-w-[1120px] text-sm">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b text-left">
                      <th className="px-3 py-2 font-medium text-muted-foreground">#</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Content</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Schedule For</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Media</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Channels</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Format</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Alt Text</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row, index) => (
                      <tr key={row.id} className="border-b align-top last:border-b-0">
                        <td className="px-3 py-3 text-xs text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="group/content min-w-[250px]">
                            <div className="relative">
                              <Textarea
                                value={row.content}
                                onChange={(event) => updateBulkRow(row.id, 'content', event.target.value)}
                                placeholder="Write the post content"
                                className="min-h-[104px] resize-none rounded-2xl border-border bg-background pr-11 pt-4 shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-primary/40"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={enhancingRows[row.id] ? Loader2 : Wand2}
                                className="absolute right-2 top-2 z-10 size-7 !px-0 rounded-full border border-border/60 bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/content:opacity-100 group-focus-within/content:opacity-100"
                                onClick={() => enhanceBulkRow(row.id)}
                                disabled={enhancingRows[row.id] || !row.content.trim()}
                                aria-label={`Enhance caption for row ${index + 1}`}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="min-w-[220px] rounded-2xl border border-border bg-card p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                                <span className="flex size-7 items-center justify-center rounded-full bg-brand/10 text-brand">
                                  <CalendarPlus className="size-3.5" />
                                </span>
                                Schedule
                              </div>
                              <KitChip tone={row.scheduledFor ? 'info' : 'gray'} className="text-[10px]">
                                {row.scheduledFor ? 'Queued' : 'Optional'}
                              </KitChip>
                            </div>
                            <div className="relative mt-3">
                              <CalendarPlus className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                              <input
                                type="datetime-local"
                                aria-label="Schedule date and time"
                                value={row.scheduledFor ? row.scheduledFor.slice(0, 16) : ''}
                                onChange={(event) => updateBulkRow(row.id, 'scheduledFor', event.target.value ? new Date(event.target.value).toISOString() : '')}
                                className="flex h-11 w-full rounded-xl border border-input/80 bg-background/90 pl-9 pr-3 text-sm shadow-sm outline-none transition-colors focus:border-primary/40"
                              />
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              {formatSchedulePreview(row.scheduledFor)}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="min-w-[220px] space-y-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                icon={uploadingMediaRows[row.id] ? Loader2 : Upload}
                                onClick={() => openMediaUploadForRow(row.id)}
                                disabled={uploadingMediaRows[row.id]}
                              >
                                Upload
                              </Button>
                              <Button variant="outline" size="sm" icon={ImagePlus} onClick={() => openMediaLibraryForRow(row.id)}>
                                {row.mediaUrls ? 'Replace Media' : 'Select Media'}
                              </Button>
                            </div>
                            {row.mediaUrls ? (
                              <div className="rounded-xl border bg-muted/30 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium">
                                      {decodeURIComponent(row.mediaUrls.split('/').pop() || 'Selected media')}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                      {inferBulkMediaType(row.mediaUrls) === 'video' ? 'Video asset selected' : 'Image asset selected'}
                                    </p>
                                  </div>
                                  <Button variant="ghost" size="sm" icon={X} className="size-7 !px-0" onClick={() => clearRowMedia(row.id)} />
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">Choose a brand media asset for this row.</p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="min-w-[220px] space-y-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="w-full justify-start">
                                  {getRowChannelIds(row).length === 0 ? 'Use selected accounts' : `${getRowChannelIds(row).length} channel${getRowChannelIds(row).length === 1 ? '' : 's'}`}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-72 p-0">
                                <Command>
                                  <CommandInput placeholder="Search channels..." />
                                  <CommandList>
                                    <CommandEmpty>No matching channels.</CommandEmpty>
                                    <CommandGroup>
                                      {accounts.map((account) => {
                                        const isSelected = getRowChannelIds(row).includes(account._id);
                                        const config = platformConfig[account.platform as Platform];
                                        if (!config) return null;
                                        const Icon = config.icon;

                                        return (
                                          <CommandItem
                                            key={account._id}
                                            value={`${account.platformDisplayName || account.platformUsername} ${account.platform}`}
                                            onSelect={() => toggleRowChannel(row.id, account._id)}
                                          >
                                            <Check className={cn('size-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                                            <Icon className={cn('size-3.5', config.color)} />
                                            <div className="min-w-0">
                                              <p className="truncate text-sm">{account.platformDisplayName || `@${account.platformUsername}`}</p>
                                              <p className="text-[11px] text-muted-foreground">{config.name}</p>
                                            </div>
                                          </CommandItem>
                                        );
                                      })}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            {getRowChannelIds(row).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {accounts
                                  .filter((account) => getRowChannelIds(row).includes(account._id))
                                  .map((account) => (
                                    <KitChip key={account._id} tone="gray" className="max-w-full">
                                      <span className="truncate">{account.platformDisplayName || `@${account.platformUsername}`}</span>
                                    </KitChip>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">Falls back to the selected accounts in the sidebar.</p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="min-w-[140px]">
                            <Select value={row.postFormat} onValueChange={(value) => updateBulkRow(row.id, 'postFormat', value)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="standard">Post</SelectItem>
                                <SelectItem value="reel">Reel</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Textarea
                            value={row.altText}
                            onChange={(event) => updateBulkRow(row.id, 'altText', event.target.value)}
                            placeholder="Optional alt text for image rows"
                            className="min-h-[92px] min-w-[200px] resize-none"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <Button variant="ghost" size="sm" icon={Trash2} className="size-8 !px-0 text-muted-foreground hover:text-destructive" onClick={() => removeBulkRow(row.id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/30 p-3 text-xs text-muted-foreground">
              Publish uses any row with content. Schedule uses rows with both content and schedule time. Empty rows stay in the table until you remove them.
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => push('/social/create-post')}>
                Back To Composer
              </Button>
              <Button variant="outline" icon={isBulkPublishing ? Loader2 : Send} onClick={handleBulkPublish} disabled={isBulkPublishing || isBulkScheduling || bulkPublishRows.length === 0}>
                {isBulkPublishing ? 'Publishing…' : 'Publish Batch'}
              </Button>
              <Button variant="brand" icon={isBulkScheduling ? Loader2 : CalendarPlus} onClick={handleBulkSchedule} disabled={isBulkScheduling || isBulkPublishing || bulkScheduleRows.length === 0}>
                {isBulkScheduling ? 'Scheduling…' : 'Schedule Batch'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={libraryDialogOpen} onOpenChange={setLibraryDialogOpen}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Select Media</DialogTitle>
            <DialogDescription>
              Choose a library asset for {activeMediaRow ? `row ${bulkRows.findIndex((row) => row.id === activeMediaRow.id) + 1}` : 'this row'}.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {isLibraryLoading ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="aspect-square animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : libraryAssets.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {libraryAssets.map((asset) => (
                  <button
                    key={asset._id}
                    type="button"
                    className="group relative aspect-square overflow-hidden rounded-lg border bg-muted text-left transition-colors hover:border-primary/40"
                    onClick={() => selectMediaForRow(asset)}
                  >
                    {asset.type === 'image' ? (
                      <NextImage
                        src={asset.thumbnailUrl || asset.url}
                        alt={asset.altText || asset.originalName}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <video
                        src={asset.thumbnailUrl || asset.url}
                        className="h-full w-full object-cover"
                        aria-label={asset.originalName || 'Video asset'}
                        muted
                      />
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-white">
                      <p className="truncate text-xs font-medium">{asset.originalName}</p>
                      <p className="text-[10px] text-white/70">{asset.type === 'video' ? 'Video asset' : 'Image asset'}</p>
                    </div>
                    {asset.type === 'video' ? (
                      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">
                        <Film className="size-3" />
                        Video
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No media assets found for this brand yet.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <input
        ref={bulkUploadInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        aria-label="Upload media file"
        onChange={handleMediaUploadForRow}
      />
    </div>
    </ModuleShell>
  );
}
