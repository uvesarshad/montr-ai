'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import NextImage from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button, Chip as KitChip, CollapsibleSection, Input, Field, Switch, FormDialog, Textarea as KitTextarea } from '@/components/ui-kit';
import { PLATFORM_CAPABILITIES } from '@/lib/social/providers/registry';
import {
    AlertTriangle,
    Instagram,
    Youtube,
    Image as ImageIcon,
    Heart,
    MessageCircle,
    Share2,
    Send,
    CalendarPlus,
    Loader2,
    Check,
    LayoutGrid,
    Type,
    Wand2,
    AlertCircle,
    Building2,
    Plus,
    X,
    Hash,
    Sparkles,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock3,
    Film,
    FileSpreadsheet,
    Gauge,
    ImagePlus,
    ShieldCheck,
    XCircle,
    Pencil,
    PencilLine,
    RotateCcw,
    ListOrdered,
    MessageSquarePlus,
    Layers,
    Trash2,
    Repeat,
    Bookmark,
    Settings2,
    Signature,
    Clapperboard,
    History
} from 'lucide-react';
import { FacebookLogo, LinkedinLogo, RedditLogo, XLogo, TelegramLogo, GoogleBusinessLogo, DribbbleLogo, ThreadsLogo, NotionLogo } from '@/components/social-icons';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/lib/auth-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ModuleShell } from '@/components/shell/module-shell';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { NotionBrowser } from '@/components/integrations/notion-browser';
import { SocialAIAssistantDialog } from '@/components/social/social-ai-assistant-dialog';
import { RevisionHistoryPanel } from '@/components/social/revision-history-panel';
import {
    buildComposerPublishMedia,
    createRemoteComposerMediaItem,
    moveComposerMedia,
    removeComposerMedia,
    type ComposerMediaItem,
} from '@/lib/social/composer-media';
import { buildCreatePostInsights } from '@/lib/social/create-post-insights';
import { getCreatePostSummaryState } from '@/lib/social/create-post-summary';
import { getBrandMediaStorageFolder } from '@/lib/social/media-library';
import { openAgentLauncher } from '@/lib/agent/launcher';

interface Brand {
    _id: string;
    name: string;
    handle: string;
    avatarUrl?: string;
}

interface TelegramChannel {
    chatId: string;
    title: string;
    type: 'channel' | 'group' | 'supergroup';
    username?: string;
}

interface SocialAccount {
    _id: string;
    platform: string;
    platformUsername: string;
    platformDisplayName?: string;
    avatarUrl?: string;
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
    size: number;
}

interface StorageProviderOption {
    id: string;
    name: string;
    email?: string;
    provider: 'aws' | 'wasabi' | 'google-drive' | 'local';
    isDefault: boolean;
}

interface DriveMediaFile {
    key: string;
    url: string;
    name: string;
    size: number;
    contentType: string;
}

type PostComposerMedia = ComposerMediaItem & {
    file?: File;
    assetId?: string;
};

type Platform = 'instagram' | 'linkedin' | 'x' | 'facebook' | 'youtube' | 'reddit' | 'telegram' | 'google_business' | 'dribbble' | 'threads';

// Platform character limits
const platformCharLimits: Record<Platform, number> = {
    x: 280,
    threads: 500,
    instagram: 2200,
    linkedin: 3000,
    facebook: 63206,
    youtube: 5000,
    reddit: 40000,
    telegram: 4096,
    google_business: 1500,
    dribbble: 2000,
};

const platformConfig: Record<Platform, { name: string; icon: React.ElementType; color: string; bg: string }> = {
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

// Common hashtag suggestions by category
const hashtagSuggestions: Record<string, string[]> = {
    marketing: ['#marketing', '#socialmedia', '#digitalmarketing', '#branding', '#contentcreator'],
    business: ['#business', '#entrepreneur', '#startup', '#success', '#motivation'],
    tech: ['#tech', '#technology', '#innovation', '#ai', '#software'],
    lifestyle: ['#lifestyle', '#life', '#love', '#happy', '#instagood'],
    photography: ['#photography', '#photo', '#photooftheday', '#picoftheday', '#beautiful'],
};

// Best-time-to-post slot (matches GET /api/social/analytics/best-times). `dayOfWeek`
// is 0=Sunday and `hour` is a UTC-derived bucket.
interface BestTimeSlot {
    dayOfWeek: number;
    hour: number;
    score: number;
    samples: number;
}

// Build a Date for the next upcoming occurrence of a UTC (dayOfWeek, hour) bucket.
// We construct the instant in UTC so local formatting (and the dialog's local
// date/time fields) render it in the user's timezone.
function nextOccurrenceForUtcSlot(dayOfWeek: number, hour: number): Date {
    const now = new Date();
    const candidate = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        hour, 0, 0, 0,
    ));
    // Advance to the matching UTC weekday, then ensure it is strictly in the future.
    const dayDelta = (dayOfWeek - candidate.getUTCDay() + 7) % 7;
    candidate.setUTCDate(candidate.getUTCDate() + dayDelta);
    if (candidate <= now) {
        candidate.setUTCDate(candidate.getUTCDate() + 7);
    }
    return candidate;
}

const SocialPreview = ({
    platform,
    caption,
    mediaPreview,
    brandName,
    brandHandle,
    isOverridden,
    onEdit,
    onEnhance,
    onClear,
    isEnhancing
}: {
    platform: Platform;
    caption: string;
    mediaPreview: { url: string; type: 'image' | 'video' } | null;
    brandName: string;
    brandHandle: string;
    isOverridden?: boolean;
    onEdit?: () => void;
    onEnhance?: () => void;
    onClear?: () => void;
    isEnhancing?: boolean;
}) => {
    const config = platformConfig[platform];
    const userAvatar = PlaceHolderImages.find((img) => img.id === 'user-avatar-1');
    const Icon = config.icon;

    return (
        <div className="mb-6 animate-in slide-in-from-right-4 duration-500">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className={cn("p-1.5 rounded-full", config.bg)}>
                        <Icon className={cn("size-3.5", config.color)} />
                    </div>
                    <h3>{config.name} Preview</h3>
                    {isOverridden && (
                        <KitChip tone="brand" className="text-[10px]">
                            Customized
                        </KitChip>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    {onEnhance && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={isEnhancing ? Loader2 : Wand2}
                            className="size-7 !px-0 text-muted-foreground hover:text-brand"
                            onClick={onEnhance}
                            disabled={isEnhancing}
                            title="Enhance for this platform"
                        />
                    )}
                    {onEdit && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={Pencil}
                            className="size-7 !px-0 text-muted-foreground hover:text-brand"
                            onClick={onEdit}
                            title="Edit caption"
                        />
                    )}
                    {isOverridden && onClear && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={RotateCcw}
                            className="size-7 !px-0 text-muted-foreground hover:text-destructive"
                            onClick={onClear}
                            title="Clear customization"
                        />
                    )}
                </div>
            </div>
            <Card className="overflow-hidden border-muted shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                        <Avatar className="size-9 border border-border">
                            <AvatarImage src={userAvatar?.imageUrl} />
                            <AvatarFallback>ME</AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="font-semibold text-xs leading-none">{brandName}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">@{brandHandle} &bull; Just now</p>
                        </div>
                    </div>
                    <p className="text-sm my-3 whitespace-pre-wrap leading-relaxed">{caption || <span className="text-muted-foreground italic">Your caption will appear here...</span>}</p>
                    {mediaPreview?.type === 'image' && (
                        <div className="aspect-square relative w-full bg-muted/30 rounded-lg overflow-hidden mt-2 border border-border/50">
                            <NextImage src={mediaPreview.url} alt="Post preview" fill className="object-cover" />
                        </div>
                    )}
                    {mediaPreview?.type === 'video' && (
                        <div className="aspect-square relative w-full bg-muted/30 rounded-lg overflow-hidden mt-2 border border-border/50">
                            <video src={mediaPreview.url} className="h-full w-full object-cover" controls muted aria-label="Post video preview" />
                        </div>
                    )}
                    {!mediaPreview && (
                        <div className="aspect-square relative w-full bg-muted/30 rounded-lg flex flex-col items-center justify-center mt-2 border border-dashed border-border">
                            <ImageIcon className="size-10 text-muted-foreground/30 mb-2" />
                            <p className="text-xs text-muted-foreground/50">No media selected</p>
                        </div>
                    )}
                </CardContent>
                <div className="bg-muted/30 px-4 py-2 border-t flex justify-between items-center">
                    <div className="flex gap-4">
                        <Heart className="size-4 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer" />
                        <MessageCircle className="size-4 text-muted-foreground hover:text-blue-500 transition-colors cursor-pointer" />
                        <Send className="size-4 text-muted-foreground hover:text-green-500 transition-colors cursor-pointer" />
                    </div>
                    <Share2 className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
                </div>
            </Card>
        </div>
    );
};

export default function CreatePostPage() {
    const [caption, setCaption] = useState('');
    const [mediaFiles, setMediaFiles] = useState<PostComposerMedia[]>([]);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [showHashtagPanel, setShowHashtagPanel] = useState(false);
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Media Dialog State
    const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
    const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
    const [altTextInput, setAltTextInput] = useState('');
    const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
    const [libraryAssets, setLibraryAssets] = useState<LibraryMediaAsset[]>([]);
    const [isLibraryLoading, setIsLibraryLoading] = useState(false);
    const [mediaPickerTab, setMediaPickerTab] = useState<'library' | 'drive'>('library');
    const [storageProviders, setStorageProviders] = useState<StorageProviderOption[]>([]);
    const [driveFiles, setDriveFiles] = useState<DriveMediaFile[]>([]);
    const [isDriveFilesLoading, setIsDriveFilesLoading] = useState(false);

    // AI slideshow→video generator (Epic 4.3) — dialog + form state
    const [slideshowDialogOpen, setSlideshowDialogOpen] = useState(false);
    const [slideshowTopic, setSlideshowTopic] = useState('');
    const [slideshowSlideCount, setSlideshowSlideCount] = useState('5');
    const [isGeneratingSlideshow, setIsGeneratingSlideshow] = useState(false);

    // Brand & accounts state
    const [brands, setBrands] = useState<Brand[]>([]);
    const [selectedBrandId, setSelectedBrandId] = useState<string>('');
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [selectedTelegramChannels, setSelectedTelegramChannels] = useState<Record<string, string[]>>({});
    const [isLoading, setIsLoading] = useState(true);

    // AI states
    const [isEnhanceLoading, setIsEnhanceLoading] = useState(false);
    const [showAIAssistant, setShowAIAssistant] = useState(false);
    const [platformCaptions, setPlatformCaptions] = useState<Record<string, string>>({});
    const [isEnhancingPlatform, setIsEnhancingPlatform] = useState<Record<string, boolean>>({});
    const [editingPlatformId, setEditingPlatformId] = useState<string | null>(null);
    const [platformCaptionInput, setPlatformCaptionInput] = useState('');
    const [aiHashtags, setAiHashtags] = useState<string[]>([]);
    const [isHashtagLoading, setIsHashtagLoading] = useState(false);

    // Advanced composition: thread, first comment, caption variants
    const [threadEnabled, setThreadEnabled] = useState(false);
    const [threadParts, setThreadParts] = useState<string[]>([]);
    const [instagramFirstComment, setInstagramFirstComment] = useState('');

    // Epic 1.5/1.1/1.2/1.3 — generic first comment, per-platform settings,
    // dynamic options, recurring, sets + signatures. All additive/optional.
    const [firstComment, setFirstComment] = useState('');
    const [platformSettings, setPlatformSettings] = useState<Record<string, Record<string, unknown>>>({});
    // Dynamic option cache keyed by `${platform}:${accountId}[:subreddit]`.
    const [dynamicOptions, setDynamicOptions] = useState<Record<string, { value: string; label: string }[]>>({});
    const [optionsLoading, setOptionsLoading] = useState<Record<string, boolean>>({});

    // Recurring
    type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';
    const [recurFrequency, setRecurFrequency] = useState<'off' | RecurrenceFrequency>('off');
    const [recurInterval, setRecurInterval] = useState(1);
    const [recurEndDate, setRecurEndDate] = useState('');
    const [recurDaysOfWeek, setRecurDaysOfWeek] = useState<number[]>([]);

    // Channel sets + signatures
    const [channelSets, setChannelSets] = useState<{ _id: string; name: string; accountIds: string[] }[]>([]);
    const [signatures, setSignatures] = useState<{ _id: string; name: string; text: string; autoAdd?: boolean }[]>([]);
    const [appliedSignatureId, setAppliedSignatureId] = useState<string | null>(null);
    const [showSaveSetDialog, setShowSaveSetDialog] = useState(false);
    const [newSetName, setNewSetName] = useState('');
    const [isSavingSet, setIsSavingSet] = useState(false);
    const [autoSignatureApplied, setAutoSignatureApplied] = useState(false);
    const [isVariantsLoading, setIsVariantsLoading] = useState(false);
    const [captionVariants, setCaptionVariants] = useState<{ label: string; content: string }[]>([]);
    const [showVariantsDialog, setShowVariantsDialog] = useState(false);

    // Scheduling state
    const [showScheduleDialog, setShowScheduleDialog] = useState(false);
    const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
    const [scheduleTime, setScheduleTime] = useState('12:00');
    const [isScheduling, setIsScheduling] = useState(false);
    const [postFormat, setPostFormat] = useState<'standard' | 'reel'>('standard');

    // Best-time-to-post suggestions (fetched lazily when the schedule dialog opens,
    // cached per brand). Buckets are UTC-derived from the brand's own engagement.
    const [bestTimes, setBestTimes] = useState<Record<string, { slots: BestTimeSlot[]; fallback: boolean }>>({});

    // Draft state
    const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const searchParams = useSearchParams();

    const { toast } = useToast();
    const { data: session } = useSession();
    const { push } = useRouter();
    const getErrorMessage = (error: unknown) =>
        error instanceof Error ? error.message : 'Unexpected error';

    // Fetch brands on mount
    useEffect(() => {
        async function fetchBrands() {
            try {
                const response = await fetch('/api/social/brands');
                if (response.ok) {
                    const data = await response.json();
                    setBrands(data.brands);
                    if (data.brands.length > 0) {
                        const lastBrand = localStorage.getItem('lastSelectedBrandId');
                        if (lastBrand && data.brands.some((b: Brand) => b._id === lastBrand)) {
                            setSelectedBrandId(lastBrand);
                        } else {
                            setSelectedBrandId(data.brands[0]._id);
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to fetch brands:', error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchBrands();
    }, []);

    // Save selected brand to local storage
    useEffect(() => {
        if (selectedBrandId) {
            localStorage.setItem('lastSelectedBrandId', selectedBrandId);
        }
    }, [selectedBrandId]);

    // Fetch accounts when brand changes  
    useEffect(() => {
        async function fetchAccounts() {
            if (!selectedBrandId) {
                setAccounts([]);
                return;
            }

            try {
                const response = await fetch(`/api/social/brands/${selectedBrandId}/accounts`);
                if (response.ok) {
                    const data = await response.json();
                    setAccounts(data.accounts);
                    setSelectedAccountIds([]); // Reset selection when brand changes
                    setPlatformCaptions({});
                }
            } catch (error) {
                console.error('Failed to fetch accounts:', error);
            }
        }
        fetchAccounts();
    }, [selectedBrandId]);

    // Fetch saved channel sets + signatures when the brand changes (Epic 1.2/1.3).
    // Failures degrade silently — these are optional conveniences.
    useEffect(() => {
        if (!selectedBrandId) {
            setChannelSets([]);
            setSignatures([]);
            setAppliedSignatureId(null);
            setAutoSignatureApplied(false);
            return;
        }

        let cancelled = false;
        const brandId = selectedBrandId;

        (async () => {
            try {
                const [setsRes, sigRes] = await Promise.all([
                    fetch(`/api/social/sets?brandId=${brandId}`),
                    fetch(`/api/social/signatures?brandId=${brandId}`),
                ]);
                if (cancelled) return;
                if (setsRes.ok) {
                    const data = await setsRes.json();
                    setChannelSets(Array.isArray(data.sets) ? data.sets : []);
                }
                if (sigRes.ok) {
                    const data = await sigRes.json();
                    setSignatures(Array.isArray(data.signatures) ? data.signatures : []);
                }
            } catch {
                // Silent — optional feature.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [selectedBrandId]);

    useEffect(() => {
        if (!selectedBrandId) {
            setStorageProviders([]);
            return;
        }

        async function fetchStorageProviders() {
            try {
                const response = await fetch(`/api/storage/upload?brandId=${selectedBrandId}`);
                if (!response.ok) {
                    throw new Error('Failed to load storage providers');
                }

                const data = await response.json();
                setStorageProviders(data.providers || []);
            } catch (error) {
                console.error('Failed to fetch storage providers:', error);
            }
        }

        fetchStorageProviders();
    }, [selectedBrandId]);

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

    // Fetch best-time-to-post suggestions when the schedule dialog opens (cached per
    // brand). Failures/loading are swallowed silently — the block is purely additive.
    useEffect(() => {
        if (!showScheduleDialog || !selectedBrandId || bestTimes[selectedBrandId]) {
            return;
        }

        let cancelled = false;
        const brandId = selectedBrandId;

        async function fetchBestTimes() {
            try {
                const response = await fetch(`/api/social/analytics/best-times?brandId=${brandId}`);
                if (!response.ok) return;
                const data = await response.json();
                if (cancelled) return;
                setBestTimes((prev) => ({
                    ...prev,
                    [brandId]: {
                        slots: Array.isArray(data.overall) ? data.overall : [],
                        fallback: Boolean(data.fallback),
                    },
                }));
            } catch {
                // Silent: no toast, no spinner — zero impact when the API fails.
            }
        }

        fetchBestTimes();
        return () => {
            cancelled = true;
        };
    }, [showScheduleDialog, selectedBrandId, bestTimes]);

    const connectedDriveProvider = useMemo(
        () => storageProviders.find((provider) => provider.provider === 'google-drive') || null,
        [storageProviders],
    );

    useEffect(() => {
        if (!libraryDialogOpen || mediaPickerTab !== 'drive' || !selectedBrandId || !connectedDriveProvider) {
            return;
        }

        const driveStorageId = connectedDriveProvider.id;

        async function fetchDriveFiles() {
            setIsDriveFilesLoading(true);
            try {
                const brand = brands.find((item) => item._id === selectedBrandId);
                const params = new URLSearchParams({
                    brandId: selectedBrandId,
                    storageId: driveStorageId,
                });
                if (brand?.handle) {
                    params.set('brandHandle', brand.handle);
                }

                const response = await fetch(`/api/storage/files?${params.toString()}`);
                if (!response.ok) {
                    throw new Error('Failed to load Drive media');
                }

                const data = await response.json();
                setDriveFiles((data.files || []).filter((file: DriveMediaFile) => (
                    file.contentType.startsWith('image/') || file.contentType.startsWith('video/')
                )));
            } catch (error) {
                console.error('Failed to fetch Drive files:', error);
                toast({ variant: 'destructive', title: 'Failed to load Google Drive media' });
            } finally {
                setIsDriveFilesLoading(false);
            }
        }

        fetchDriveFiles();
    }, [brands, connectedDriveProvider, libraryDialogOpen, mediaPickerTab, selectedBrandId, toast]);

    // Load draft from URL if draftId is provided
    useEffect(() => {
        const draftId = searchParams.get('draftId');
        if (!draftId) return;

        async function loadDraft() {
            try {
                const response = await fetch(`/api/social/drafts`);
                if (response.ok) {
                    const data = await response.json();
                    const draft = data.drafts?.find((d: { id: string; content?: string; brandId?: string; title?: string }) => d.id === draftId);
                    if (draft) {
                        // Fetch full draft details via individual endpoint
                        const fullResponse = await fetch(`/api/social/drafts?id=${draftId}`);
                        if (fullResponse.ok) {
                            await fullResponse.json();
                            // For now just use the list data
                        }
                        setCurrentDraftId(draftId);
                        setCaption(draft.content || '');
                        if (draft.brandId) {
                            setSelectedBrandId(draft.brandId);
                        }
                        toast({ title: 'Draft loaded', description: draft.title });
                    }
                }
            } catch (error) {
                console.error('Failed to load draft:', error);
            }
        }

        loadDraft();
    }, [searchParams, toast]);

    // Load template from URL if templateId is provided (mirrors the draft loader)
    useEffect(() => {
        const templateId = searchParams.get('templateId');
        if (!templateId || !selectedBrandId) return;

        async function loadTemplate() {
            try {
                const response = await fetch(`/api/social/templates?brandId=${selectedBrandId}`);
                if (!response.ok) return;

                const data = await response.json();
                const template = data.templates?.find(
                    (t: { _id: string; content?: string; name?: string }) => t._id === templateId,
                );
                if (!template) return;

                setCaption(template.content || '');
                toast({ title: 'Template loaded', description: template.name });

                // Best-effort usage increment (model tracks usageCount; PATCH
                // persists via the generic template update route).
                fetch('/api/social/templates', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        templateId,
                        usageCount: (template.usageCount ?? 0) + 1,
                    }),
                }).catch(() => undefined);
            } catch (error) {
                console.error('Failed to load template:', error);
            }
        }

        loadTemplate();
    }, [searchParams, selectedBrandId, toast]);

    // Save draft handler
    const handleSaveDraft = useCallback(async () => {
        if (!selectedBrandId) {
            toast({ variant: 'destructive', title: 'Select a brand first' });
            return;
        }

        setIsSavingDraft(true);
        try {
            const draftData = {
                brandId: selectedBrandId,
                content: caption,
                media: mediaFiles.map((item) => {
                    const { file, ...media } = item;
                    void file;
                    return media;
                }),
                platforms: selectedAccountIds.map(id => {
                    const acc = accounts.find(a => a._id === id);
                    return {
                        accountId: id,
                        platform: acc?.platform || '',
                        platformUsername: acc?.platformUsername || '',
                        content: platformCaptions[id] || caption,
                        telegramChatIds: selectedTelegramChannels[id] || [],
                    };
                }),
            };

            let response;
            if (currentDraftId) {
                // Update existing draft
                response = await fetch('/api/social/drafts', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: currentDraftId, ...draftData }),
                });
            } else {
                // Create new draft
                response = await fetch('/api/social/drafts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(draftData),
                });
            }

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            setCurrentDraftId(data.draft.id);
            setLastSaved(new Date());
            toast({ title: 'Draft saved', description: data.draft.title });
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Failed to save draft', description: getErrorMessage(error) });
        } finally {
            setIsSavingDraft(false);
        }
    }, [selectedBrandId, caption, mediaFiles, selectedAccountIds, accounts, selectedTelegramChannels, currentDraftId, toast, platformCaptions]);

    const selectedBrand = brands.find(b => b._id === selectedBrandId);
    const selectedAccounts = useMemo(
        () => accounts.filter((account) => selectedAccountIds.includes(account._id)),
        [accounts, selectedAccountIds],
    );
    const selectedPlatforms = useMemo(
        () => selectedAccounts.map((account) => account.platform as Platform),
        [selectedAccounts],
    );
    const selectedTelegramAccounts = useMemo(
        () => selectedAccounts.filter((account) => account.platform === 'telegram'),
        [selectedAccounts],
    );
    const hasThreadablePlatform = useMemo(
        () => selectedAccounts.some((account) => account.platform === 'x' || account.platform === 'threads'),
        [selectedAccounts],
    );
    const hasInstagramAccount = useMemo(
        () => selectedAccounts.some((account) => account.platform === 'instagram'),
        [selectedAccounts],
    );
    const hasCarouselPlatform = useMemo(
        () => selectedAccounts.some((account) => account.platform === 'x' || account.platform === 'instagram'),
        [selectedAccounts],
    );
    // Capability-derived gates (Epic 1.5). Source of truth = PLATFORM_CAPABILITIES.
    const capabilityFor = useCallback(
        (platform: string) => PLATFORM_CAPABILITIES[platform] ?? null,
        [],
    );
    const hasFirstCommentPlatform = useMemo(
        () => selectedAccounts.some((a) => capabilityFor(a.platform)?.firstComment),
        [selectedAccounts, capabilityFor],
    );
    // Smallest carousel allowance across selected carousel-capable platforms; used
    // to warn when the attached media count would be truncated on publish.
    const carouselMaxAcrossPlatforms = useMemo(() => {
        const caps = selectedAccounts
            .map((a) => capabilityFor(a.platform))
            .filter((c): c is NonNullable<typeof c> => Boolean(c));
        if (caps.length === 0) return null;
        return Math.min(...caps.map((c) => (c.carousel ? c.maxMedia : 1)));
    }, [selectedAccounts, capabilityFor]);
    const carouselOverLimit = useMemo(
        () => carouselMaxAcrossPlatforms != null && mediaFiles.length > carouselMaxAcrossPlatforms,
        [carouselMaxAcrossPlatforms, mediaFiles.length],
    );
    const imageMediaCount = useMemo(
        () => mediaFiles.filter((media) => media.type === 'image').length,
        [mediaFiles],
    );
    const imagesMissingAltText = useMemo(
        () => mediaFiles.filter((media) => media.type === 'image' && !media.altText?.trim()).length,
        [mediaFiles],
    );
    const composerInsights = useMemo(() => buildCreatePostInsights({
        hasSelectedBrand: Boolean(selectedBrandId),
        selectedPlatforms,
        selectedTelegramAccountIds: selectedTelegramAccounts.map((account) => account._id),
        telegramChannelsByAccount: selectedTelegramChannels,
        caption,
        mediaCount: mediaFiles.length,
        imageCount: mediaFiles.filter((media) => media.type === 'image').length,
        videoCount: mediaFiles.filter((media) => media.type === 'video').length,
        postFormat,
        imagesMissingAltText,
    }), [caption, imagesMissingAltText, mediaFiles, postFormat, selectedBrandId, selectedPlatforms, selectedTelegramAccounts, selectedTelegramChannels]);
    const allAccountsSelected = accounts.length > 0 && selectedAccountIds.length === accounts.length;
    const primaryPlatform = composerInsights.stats.primaryPlatform;
    const primaryPlatformConfig = primaryPlatform ? platformConfig[primaryPlatform] : null;
    const PrimaryPlatformIcon = primaryPlatformConfig?.icon;
    const summaryState = useMemo(() => getCreatePostSummaryState({
        isExpanded: isSummaryExpanded,
        blockersCount: composerInsights.blockers.length,
        warningsCount: composerInsights.warnings.length,
    }), [composerInsights.blockers.length, composerInsights.warnings.length, isSummaryExpanded]);
    const primaryMediaPreview = mediaFiles[0]
        ? { url: mediaFiles[0].url, type: mediaFiles[0].type }
        : null;
    const hasVideoMedia = mediaFiles.some((media) => media.type === 'video');

    const toggleAccount = (accountId: string) => {
        setSelectedAccountIds(prev =>
            prev.includes(accountId) ? prev.filter(id => id !== accountId) : [...prev, accountId]
        );
    };
    const handleSelectAllAccounts = useCallback(() => {
        setSelectedAccountIds(accounts.map((account) => account._id));
    }, [accounts]);
    const handleClearAccountSelection = useCallback(() => {
        setSelectedAccountIds([]);
    }, []);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            const newMediaFiles: PostComposerMedia[] = [];

            for (const file of Array.from(files)) {
                const objectUrl = URL.createObjectURL(file);
                newMediaFiles.push({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    url: objectUrl,
                    type: file.type.startsWith('video/') ? 'video' : 'image',
                    source: 'local',
                    file,
                });
            }

            setMediaFiles(prev => [...prev, ...newMediaFiles]);
        }
        // Reset input for re-upload
        if (event.target) event.target.value = '';
    };

    const removeMedia = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setMediaFiles(prev => removeComposerMedia(prev, id));
    };

    const moveMedia = (id: string, direction: 'up' | 'down', e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setMediaFiles(prev => moveComposerMedia(prev, id, direction));
    };

    const handleSaveAltText = () => {
        if (!selectedMediaId) return;
        setMediaFiles(prev => prev.map(m => m.id === selectedMediaId ? { ...m, altText: altTextInput } : m));
        setMediaDialogOpen(false);
    };

    const addLibraryMedia = (asset: LibraryMediaAsset) => {
        setMediaFiles((prev) => {
            if (prev.some((item) => item.assetId === asset._id)) {
                return prev;
            }

            return [
                ...prev,
                createRemoteComposerMediaItem({
                    id: `library-${asset._id}`,
                    assetId: asset._id,
                    url: asset.url,
                    type: asset.type,
                    altText: asset.altText,
                }),
            ];
        });
        setLibraryDialogOpen(false);
    };

    const addDriveMedia = (file: DriveMediaFile) => {
        setMediaFiles((prev) => {
            const nextId = `drive-${file.key}`;
            if (prev.some((item) => item.id === nextId)) {
                return prev;
            }

            return [
                ...prev,
                createRemoteComposerMediaItem({
                    id: nextId,
                    url: file.url,
                    type: file.contentType.startsWith('video/') ? 'video' : 'image',
                    altText: file.name,
                }),
            ];
        });
        setLibraryDialogOpen(false);
    };

    // AI slideshow→video generator (Epic 4.3). Calls the plan-gated slideshow
    // endpoint, then appends the returned VIDEO url to the composer's media state
    // by mirroring addLibraryMedia/addDriveMedia (createRemoteComposerMediaItem +
    // setMediaFiles), setting type 'video'. Returns a promise so the FormDialog
    // shows a busy state and closes on success.
    const handleGenerateSlideshow = useCallback(async () => {
        if (!selectedBrandId) {
            toast({ variant: 'destructive', title: 'Select a brand first', description: 'A brand is required to generate a slideshow.' });
            throw new Error('no-brand');
        }
        const topic = slideshowTopic.trim();
        if (!topic) {
            toast({ variant: 'destructive', title: 'Add a topic', description: 'Describe what the slideshow should be about.' });
            throw new Error('no-topic');
        }
        const parsedCount = parseInt(slideshowSlideCount, 10);
        const slideCount = Number.isFinite(parsedCount) ? Math.min(10, Math.max(2, parsedCount)) : undefined;

        setIsGeneratingSlideshow(true);
        try {
            const response = await fetch('/api/social/media/slideshow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brandId: selectedBrandId, topic, ...(slideCount ? { slideCount } : {}) }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || (response.status === 402 ? 'AI video is not available on your plan.' : 'Failed to generate slideshow.'));
            }
            const url: string | undefined = data?.url;
            if (!url) {
                throw new Error('Slideshow generated but no media URL was returned.');
            }
            // Append the generated video exactly like addLibraryMedia/addDriveMedia.
            setMediaFiles((prev) => [
                ...prev,
                createRemoteComposerMediaItem({
                    id: `slideshow-${Date.now()}`,
                    url,
                    type: 'video',
                    altText: topic,
                }),
            ]);
            toast({ title: 'Slideshow added', description: `Generated a ${data?.slideCount ?? slideCount ?? ''}-slide video and attached it to your post.` });
            setSlideshowTopic('');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to generate slideshow.';
            // Re-throw the topic/brand guards silently; surface real failures via toast.
            if (message !== 'no-brand' && message !== 'no-topic') {
                toast({ variant: 'destructive', title: 'Slideshow failed', description: message });
            }
            throw error;
        } finally {
            setIsGeneratingSlideshow(false);
        }
    }, [selectedBrandId, slideshowTopic, slideshowSlideCount, toast]);

    const uploadAllMedia = useCallback(async (): Promise<{ url: string, type: 'image' | 'video', altText?: string }[]> => {
        if (mediaFiles.length === 0) return [];
        setIsUploadingMedia(true);
        const uploadedLocalUrls: Record<string, string> = {};
        try {
            for (const media of mediaFiles) {
                if (media.source !== 'local' || !media.file) {
                    continue;
                }
                
                const formData = new FormData();
                formData.append('file', media.file);

                const uploadResponse = await fetch('/api/social/upload', {
                    method: 'POST',
                    body: formData,
                });

                const data = await uploadResponse.json();

                if (!uploadResponse.ok || !data.url) {
                    console.error('Server upload error details:', data.details || data.error);
                    throw new Error(data.error || `Failed to upload ${media.file.name}`);
                }
                uploadedLocalUrls[media.id] = data.url;
            }
            return buildComposerPublishMedia(mediaFiles, uploadedLocalUrls);
        } finally {
            setIsUploadingMedia(false);
        }
    }, [mediaFiles]);

    // Build the full ordered thread parts for the payload ([caption, ...threadParts],
    // dropping empty parts). part 1 is always the main caption.
    const buildThreadParts = useCallback(() => {
        return [caption, ...threadParts]
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    }, [caption, threadParts]);

    // ---- Recurrence builder (Epic 1.1) --------------------------------------
    const buildRecurrence = useCallback(() => {
        if (recurFrequency === 'off') return undefined;
        const recurrence: {
            frequency: RecurrenceFrequency;
            interval: number;
            endDate?: string;
            daysOfWeek?: number[];
        } = {
            frequency: recurFrequency,
            interval: Math.max(1, recurInterval || 1),
        };
        if (recurEndDate) recurrence.endDate = new Date(recurEndDate).toISOString();
        if (recurFrequency === 'weekly' && recurDaysOfWeek.length > 0) {
            recurrence.daysOfWeek = [...recurDaysOfWeek].sort((a, b) => a - b);
        }
        return recurrence;
        // RecurrenceFrequency is a local type alias — safe to omit from deps.
    }, [recurFrequency, recurInterval, recurEndDate, recurDaysOfWeek]);

    const handlePublish = useCallback(async () => {
        if (selectedAccountIds.length === 0) {
            toast({ variant: 'destructive', title: 'No Accounts Selected', description: 'Please select at least one connected account to publish to.' });
            return;
        }
        if (isUploadingMedia) {
            toast({ variant: 'destructive', title: 'Media still uploading', description: 'Wait for uploads to finish before publishing.' });
            return;
        }
        if (!session?.user) {
            toast({ variant: 'destructive', title: 'Not Authenticated', description: 'You must be logged in to publish posts.' });
            return;
        }

        setIsPublishing(true);

        try {
            const finalMedia = await uploadAllMedia();
            const finalMediaUrls = finalMedia.map(m => m.url);
            const finalMediaTypes = finalMedia.map(m => m.type);

            const platforms = selectedAccountIds.map(accountId => {
                const account = accounts.find(a => a._id === accountId);
                if (!account) return null;

                const config: Record<string, unknown> = {
                    accountId: account._id,
                    platform: account.platform,
                    platformUsername: account.platformUsername,
                    content: platformCaptions[accountId] || caption,
                };

                if (account.platform === 'telegram') {
                    const selectedChannelIds = selectedTelegramChannels[accountId] || [];
                    if (selectedChannelIds.length === 0) {
                        throw new Error(`No Telegram channels selected for @${account.platformUsername}.`);
                    }
                    config.telegramChatIds = selectedChannelIds;
                }

                if ((account.platform === 'x' || account.platform === 'threads') && threadEnabled) {
                    const parts = buildThreadParts();
                    if (parts.length > 1) {
                        config.isThread = true;
                        config.threadParts = parts;
                    }
                }

                if (account.platform === 'instagram' && instagramFirstComment.trim()) {
                    config.instagramFirstComment = instagramFirstComment.trim();
                }

                // Generic first comment (any comment-capable platform, Epic 1.5).
                if (firstComment.trim() && capabilityFor(account.platform)?.firstComment) {
                    config.firstComment = firstComment.trim();
                }

                // Per-platform advanced settings (Epic 1.5).
                const settings = platformSettings[account._id];
                if (settings && Object.keys(settings).length > 0) {
                    config.settings = settings;
                }

                return config;
            }).filter(Boolean);

            const response = await fetch('/api/social/posts/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    intent: 'publish',
                    brandId: selectedBrandId,
                    content: caption,
                    mediaUrls: finalMediaUrls,
                    mediaTypes: finalMediaTypes,
                    postFormat,
                    platforms,
                    scheduledFor: new Date().toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    recurrence: buildRecurrence(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to publish post');
            }

            toast({
                title: data.requiresApproval ? 'Submitted for approval' : 'Queued for publishing',
                description: data.requiresApproval
                    ? 'This post is waiting for admin approval before it is published.'
                    : 'The post was added to the social calendar and will publish shortly.',
            });

            mediaFiles.forEach(m => {
                if (m.source === 'local') {
                    URL.revokeObjectURL(m.url);
                }
            });
            setMediaFiles([]);
            setCaption('');
            push('/social/calendar');
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Publishing failed', description: getErrorMessage(error) });
        } finally {
            setIsPublishing(false);
        }
    }, [selectedAccountIds, accounts, caption, mediaFiles, isUploadingMedia, postFormat, push, selectedBrandId, session, toast, selectedTelegramChannels, uploadAllMedia, platformCaptions, threadEnabled, buildThreadParts, instagramFirstComment, firstComment, capabilityFor, platformSettings, buildRecurrence]);

    const handleImportFromNotion = useCallback(async (pageId: string, title: string) => {
        if (!selectedBrandId) {
            toast({ variant: 'destructive', title: 'Select a brand first' });
            return;
        }

        try {
            toast({ title: 'Importing from Notion...', description: `Fetching content for "${title}"` });
            const response = await fetch(`/api/social/notion/pages/${pageId}?brandId=${selectedBrandId}`);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to import page');
            }
            const data = await response.json();
            setCaption(data.markdown);
            toast({ title: 'Import successful', description: `Content from "${title}" imported.` });
        } catch (error: unknown) {
            console.error('Notion import error:', error);
            toast({
                variant: 'destructive',
                title: 'Import Failed',
                description: getErrorMessage(error),
            });
        }
    }, [selectedBrandId, toast]);

    const handleEnhanceContent = async () => {
        if (!caption.trim()) {
            toast({ variant: 'destructive', title: 'Content required', description: 'Please enter some text to enhance.' });
            return;
        }

        setIsEnhanceLoading(true);
        try {
            const response = await fetch('/api/social/ai/enhance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: caption,
                    platform: selectedAccountIds.length > 0
                        ? accounts.find(a => a._id === selectedAccountIds[0])?.platform || 'general'
                        : 'general',
                    style: 'professional',
                    ...(selectedBrandId ? { brandId: selectedBrandId } : {}),
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to enhance content');
            
            setCaption(data.enhancedContent);
            toast({ title: 'Enhanced successfully!' });
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Enhance Failed', description: getErrorMessage(error) });
        } finally {
            setIsEnhanceLoading(false);
        }
    };

    const handleEnhancePlatformCaption = async (accountId: string) => {
        const currentCaption = platformCaptions[accountId] || caption;
        if (!currentCaption.trim()) return;

        const account = accounts.find(a => a._id === accountId);
        if (!account) return;

        setIsEnhancingPlatform(prev => ({ ...prev, [accountId]: true }));
        try {
            const response = await fetch('/api/social/ai/enhance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: currentCaption,
                    platform: account.platform,
                    style: 'professional',
                    ...(selectedBrandId ? { brandId: selectedBrandId } : {}),
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to enhance content');
            
            setPlatformCaptions(prev => ({ ...prev, [accountId]: data.enhancedContent }));
            toast({ title: `Enhanced for ${account.platform}!` });
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Enhance Failed', description: getErrorMessage(error) });
        } finally {
            setIsEnhancingPlatform(prev => ({ ...prev, [accountId]: false }));
        }
    };

    const handleSuggestHashtags = async () => {
        if (!caption.trim()) {
            toast({ variant: 'destructive', title: 'Content required', description: 'Write a caption first to suggest hashtags.' });
            return;
        }

        setIsHashtagLoading(true);
        try {
            const response = await fetch('/api/social/ai/hashtags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: caption,
                    platform: selectedAccountIds.length > 0
                        ? accounts.find(a => a._id === selectedAccountIds[0])?.platform || undefined
                        : undefined,
                    ...(selectedBrandId ? { brandId: selectedBrandId } : {}),
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to generate hashtags');

            setAiHashtags(data.hashtags || []);
            if (!data.hashtags?.length) {
                toast({ title: 'No hashtags returned', description: 'Try refining the caption.' });
            }
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Hashtag suggestions failed', description: getErrorMessage(error) });
        } finally {
            setIsHashtagLoading(false);
        }
    };

    const handleAppendHashtag = (tag: string) => {
        if (caption.includes(tag)) return;
        setCaption(prev => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + tag);
    };

    // Thread composition. `threadParts` holds the additional parts (2..N); part 1
    // is always the main caption.
    const addThreadPart = () => setThreadParts(prev => [...prev, '']);
    const updateThreadPart = (index: number, value: string) =>
        setThreadParts(prev => prev.map((part, i) => (i === index ? value : part)));
    const removeThreadPart = (index: number) =>
        setThreadParts(prev => prev.filter((_, i) => i !== index));

    // ---- Per-platform settings (Epic 1.5) -----------------------------------
    const setPlatformSetting = useCallback((accountId: string, key: string, value: unknown) => {
        setPlatformSettings((prev) => {
            const current = { ...(prev[accountId] || {}) };
            if (value === undefined || value === '' || value === null) {
                delete current[key];
            } else {
                current[key] = value;
            }
            return { ...prev, [accountId]: current };
        });
    }, []);
    const getPlatformSetting = useCallback(
        (accountId: string, key: string): unknown => platformSettings[accountId]?.[key],
        [platformSettings],
    );

    // ---- Dynamic options loader (Epic 1.6) ----------------------------------
    const loadDynamicOptions = useCallback(
        async (platform: string, accountId: string, subreddit?: string) => {
            const cacheKey = `${platform}:${accountId}${subreddit ? `:${subreddit}` : ''}`;
            if (dynamicOptions[cacheKey] || optionsLoading[cacheKey]) return;
            setOptionsLoading((prev) => ({ ...prev, [cacheKey]: true }));
            try {
                const params = new URLSearchParams({ accountId });
                if (subreddit) params.set('subreddit', subreddit);
                const res = await fetch(`/api/social/options/${platform}?${params.toString()}`);
                const data = await res.json();
                setDynamicOptions((prev) => ({ ...prev, [cacheKey]: data.options || [] }));
            } catch {
                setDynamicOptions((prev) => ({ ...prev, [cacheKey]: [] }));
            } finally {
                setOptionsLoading((prev) => ({ ...prev, [cacheKey]: false }));
            }
        },
        [dynamicOptions, optionsLoading],
    );

    // ---- Channel sets (Epic 1.2) --------------------------------------------
    const applyChannelSet = useCallback(
        (set: { name: string; accountIds: string[] }) => {
            // Only apply accounts that still exist on this brand.
            const valid = set.accountIds.filter((id) => accounts.some((a) => a._id === id));
            setSelectedAccountIds(valid);
            toast({ title: 'Channel set applied', description: `${set.name} (${valid.length} accounts)` });
        },
        [accounts, toast],
    );
    const handleSaveSet = useCallback(async () => {
        if (!selectedBrandId || !newSetName.trim()) return;
        setIsSavingSet(true);
        try {
            const res = await fetch('/api/social/sets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId: selectedBrandId,
                    name: newSetName.trim(),
                    accountIds: selectedAccountIds,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save set');
            if (data.set) setChannelSets((prev) => [...prev, data.set]);
            setNewSetName('');
            setShowSaveSetDialog(false);
            toast({ title: 'Channel set saved' });
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Failed to save set', description: getErrorMessage(error) });
        } finally {
            setIsSavingSet(false);
        }
    }, [selectedBrandId, newSetName, selectedAccountIds, toast]);

    // ---- Signatures (Epic 1.3) ----------------------------------------------
    // Toggle a signature: append its text to the caption (and remember which one
    // is applied so re-toggling removes it). At most one signature applied.
    const applySignature = useCallback(
        (sig: { _id: string; text: string }) => {
            setCaption((prev) => {
                let base = prev;
                // Strip any previously-applied signature text first.
                if (appliedSignatureId) {
                    const prevSig = signatures.find((s) => s._id === appliedSignatureId);
                    if (prevSig && base.endsWith(prevSig.text)) {
                        base = base.slice(0, base.length - prevSig.text.length).replace(/\n+$/, '');
                    }
                }
                if (appliedSignatureId === sig._id) {
                    // Toggling off the same signature.
                    return base;
                }
                return base ? `${base}\n\n${sig.text}` : sig.text;
            });
            setAppliedSignatureId((prev) => (prev === sig._id ? null : sig._id));
        },
        [appliedSignatureId, signatures],
    );

    // Auto-add the brand's default signature once, on first load, into an empty-ish
    // caption (does not fight a loaded draft/template with content already present).
    useEffect(() => {
        if (autoSignatureApplied || signatures.length === 0) return;
        const auto = signatures.find((s) => s.autoAdd);
        if (!auto) {
            setAutoSignatureApplied(true);
            return;
        }
        setAutoSignatureApplied(true);
        setCaption((prev) => {
            if (prev.includes(auto.text)) return prev;
            return prev ? `${prev}\n\n${auto.text}` : auto.text;
        });
        setAppliedSignatureId(auto._id);
    }, [signatures, autoSignatureApplied]);

    const handleGenerateVariants = async () => {
        if (!caption.trim()) {
            toast({ variant: 'destructive', title: 'Content required', description: 'Write a caption first to generate variants.' });
            return;
        }

        const platform = selectedAccountIds.length > 0
            ? accounts.find(a => a._id === selectedAccountIds[0])?.platform || 'general'
            : 'general';

        setIsVariantsLoading(true);
        setCaptionVariants([]);
        try {
            const variantStyles: { label: string; style: string }[] = [
                { label: 'Engaging', style: 'engaging' },
                { label: 'Casual', style: 'casual' },
            ];

            const results = await Promise.all(
                variantStyles.map(async ({ style }) => {
                    const response = await fetch('/api/social/ai/enhance', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: caption,
                            platform,
                            style,
                            ...(selectedBrandId ? { brandId: selectedBrandId } : {}),
                        }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Failed to generate variant');
                    return data.enhancedContent as string;
                }),
            );

            setCaptionVariants([
                { label: 'Original', content: caption },
                { label: variantStyles[0].label, content: results[0] },
                { label: variantStyles[1].label, content: results[1] },
            ]);
            setShowVariantsDialog(true);
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Variants Failed', description: getErrorMessage(error) });
        } finally {
            setIsVariantsLoading(false);
        }
    };

    const applyVariant = (content: string) => {
        setCaption(content);
        setShowVariantsDialog(false);
        toast({ title: 'Variant applied' });
    };

    const handleSendToAgent = useCallback(() => {
        openAgentLauncher({
            prompt: 'Turn this social draft into an execution-ready mission with suggested improvements, follow-up tasks, and publishing guidance.',
            context: {
                source: 'social_create_post',
                entityType: 'post_draft',
                entityId: currentDraftId || undefined,
                entityLabel: currentDraftId ? 'Existing social draft' : 'Composer draft',
                route: currentDraftId ? `/social/create-post?draftId=${currentDraftId}` : '/social/create-post',
                notes: [
                    selectedBrand ? `Brand: ${selectedBrand.name}` : 'Brand not selected yet',
                    selectedAccountIds.length > 0
                        ? `Selected accounts: ${selectedAccountIds.length}`
                        : 'No accounts selected yet',
                    mediaFiles.length > 0
                        ? `Media items attached: ${mediaFiles.length}`
                        : 'No media attached',
                    caption.trim()
                        ? `Caption preview: ${caption.trim().slice(0, 160)}`
                        : 'Composer is currently empty',
                ],
            },
        });
    }, [caption, currentDraftId, mediaFiles.length, selectedAccountIds.length, selectedBrand]);

    const handleSavePlatformCaption = () => {
        if (!editingPlatformId) return;
        setPlatformCaptions(prev => ({ ...prev, [editingPlatformId]: platformCaptionInput }));
        setEditingPlatformId(null);
    };

    // Reusable helpers for the per-platform settings panel (Epic 1.5).
    const renderBoolRow = (
        accountId: string,
        key: string,
        label: string,
    ) => (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2">
            <span className="text-[13px] text-foreground">{label}</span>
            <Switch
                checked={Boolean(getPlatformSetting(accountId, key))}
                onCheckedChange={(v: boolean) => setPlatformSetting(accountId, key, v || undefined)}
            />
        </div>
    );

    const renderOptionSelect = (
        accountId: string,
        platform: string,
        settingKey: string,
        label: string,
        placeholder: string,
        subreddit?: string,
    ) => {
        const cacheKey = `${platform}:${accountId}${subreddit ? `:${subreddit}` : ''}`;
        const options = dynamicOptions[cacheKey] || [];
        const loading = optionsLoading[cacheKey];
        const value = (getPlatformSetting(accountId, settingKey) as string | undefined) || '';
        return (
            <Field label={label} hint={loading ? 'Loading options…' : options.length === 0 ? 'No options found (or open to load).' : undefined}>
                <Select
                    value={value}
                    onValueChange={(v) => setPlatformSetting(accountId, settingKey, v)}
                    onOpenChange={(open) => { if (open) void loadDynamicOptions(platform, accountId, subreddit); }}
                >
                    <SelectTrigger>
                        <SelectValue placeholder={placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
        );
    };

    // Renders the relevant settings controls for one selected account's platform.
    const renderPlatformSettings = (account: SocialAccount) => {
        const platform = account.platform;
        const accountId = account._id;
        switch (platform) {
            case 'tiktok':
                return (
                    <div className="space-y-3">
                        {renderOptionSelect(accountId, 'tiktok', 'privacyLevel', 'Privacy', 'Select privacy')}
                        {renderBoolRow(accountId, 'disableDuet', 'Disable Duet')}
                        {renderBoolRow(accountId, 'disableStitch', 'Disable Stitch')}
                        {renderBoolRow(accountId, 'disableComment', 'Disable Comments')}
                        {renderBoolRow(accountId, 'isAigc', 'AI-generated content (AIGC)')}
                    </div>
                );
            case 'youtube':
                return (
                    <div className="space-y-3">
                        <Field label="Title">
                            <Input
                                value={(getPlatformSetting(accountId, 'title') as string) || ''}
                                onChange={(e) => setPlatformSetting(accountId, 'title', e.target.value)}
                                placeholder="Video title"
                            />
                        </Field>
                        <Field label="Privacy">
                            <Select
                                value={(getPlatformSetting(accountId, 'privacyStatus') as string) || ''}
                                onValueChange={(v) => setPlatformSetting(accountId, 'privacyStatus', v)}
                            >
                                <SelectTrigger><SelectValue placeholder="Select privacy" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="public">Public</SelectItem>
                                    <SelectItem value="unlisted">Unlisted</SelectItem>
                                    <SelectItem value="private">Private</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Tags" hint="Comma-separated">
                            <Input
                                value={(getPlatformSetting(accountId, 'tags') as string) || ''}
                                onChange={(e) => setPlatformSetting(accountId, 'tags', e.target.value)}
                                placeholder="tag1, tag2"
                            />
                        </Field>
                        {renderBoolRow(accountId, 'madeForKids', 'Made for kids')}
                        {renderBoolRow(accountId, 'notifySubscribers', 'Notify subscribers')}
                    </div>
                );
            case 'reddit': {
                const subreddit = (getPlatformSetting(accountId, 'subreddit') as string) || '';
                return (
                    <div className="space-y-3">
                        {renderOptionSelect(accountId, 'reddit', 'subreddit', 'Subreddit', 'Select subreddit')}
                        {subreddit
                            ? renderOptionSelect(accountId, 'reddit', 'flairId', 'Flair', 'Select flair', subreddit)
                            : null}
                        <Field label="Flair text (optional)">
                            <Input
                                value={(getPlatformSetting(accountId, 'flairText') as string) || ''}
                                onChange={(e) => setPlatformSetting(accountId, 'flairText', e.target.value)}
                                placeholder="Custom flair text"
                            />
                        </Field>
                        {renderBoolRow(accountId, 'nsfw', 'Mark NSFW')}
                        {renderBoolRow(accountId, 'spoiler', 'Mark as spoiler')}
                    </div>
                );
            }
            case 'pinterest':
                return (
                    <div className="space-y-3">
                        {renderOptionSelect(accountId, 'pinterest', 'boardId', 'Board', 'Select board')}
                        <Field label="Destination link">
                            <Input
                                value={(getPlatformSetting(accountId, 'link') as string) || ''}
                                onChange={(e) => setPlatformSetting(accountId, 'link', e.target.value)}
                                placeholder="https://…"
                            />
                        </Field>
                    </div>
                );
            case 'x':
                return (
                    <div className="space-y-3">
                        <Field label="Who can reply">
                            <Select
                                value={(getPlatformSetting(accountId, 'whoCanReply') as string) || ''}
                                onValueChange={(v) => setPlatformSetting(accountId, 'whoCanReply', v)}
                            >
                                <SelectTrigger><SelectValue placeholder="Everyone" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="everyone">Everyone</SelectItem>
                                    <SelectItem value="following">People you follow</SelectItem>
                                    <SelectItem value="mentionedUsers">Only mentioned users</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                );
            case 'discord':
                return (
                    <div className="space-y-3">
                        {renderOptionSelect(accountId, 'discord', 'channelId', 'Channel', 'Select channel')}
                    </div>
                );
            case 'slack':
                return (
                    <div className="space-y-3">
                        {renderOptionSelect(accountId, 'slack', 'channelId', 'Channel', 'Select channel')}
                    </div>
                );
            case 'devto':
                return (
                    <div className="space-y-3">
                        <Field label="Title">
                            <Input
                                value={(getPlatformSetting(accountId, 'title') as string) || ''}
                                onChange={(e) => setPlatformSetting(accountId, 'title', e.target.value)}
                                placeholder="Article title"
                            />
                        </Field>
                        <Field label="Tags" hint="Comma-separated">
                            <Input
                                value={(getPlatformSetting(accountId, 'tags') as string) || ''}
                                onChange={(e) => setPlatformSetting(accountId, 'tags', e.target.value)}
                                placeholder="webdev, javascript"
                            />
                        </Field>
                    </div>
                );
            default:
                return null;
        }
    };

    // Accounts whose platform has any settings controls to show.
    const settingsCapableAccounts = selectedAccounts.filter((a) =>
        ['tiktok', 'youtube', 'reddit', 'pinterest', 'x', 'discord', 'slack', 'devto'].includes(a.platform),
    );

    // Top suggested times for the selected brand, mapped to their next upcoming
    // local occurrence. Deduped by slot so the chips never repeat a weekday/hour.
    const suggestedTimes = useMemo(() => {
        const entry = selectedBrandId ? bestTimes[selectedBrandId] : undefined;
        if (!entry) return null;

        const seen = new Set<string>();
        const chips = entry.slots
            .filter((slot) => {
                const key = `${slot.dayOfWeek}-${slot.hour}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 5)
            .map((slot) => ({
                key: `${slot.dayOfWeek}-${slot.hour}`,
                date: nextOccurrenceForUtcSlot(slot.dayOfWeek, slot.hour),
            }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        return { chips, fallback: entry.fallback };
    }, [bestTimes, selectedBrandId]);

    const applySuggestedTime = useCallback((date: Date) => {
        setScheduleDate(date);
        setScheduleTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
    }, []);

    const handleSchedule = useCallback(async () => {
        if (selectedAccountIds.length === 0) {
            toast({ variant: 'destructive', title: 'No Accounts Selected', description: 'Please select at least one connected account to schedule to.' });
            return;
        }
        if (isUploadingMedia) {
            toast({ variant: 'destructive', title: 'Media still uploading', description: 'Wait for uploads to finish before scheduling.' });
            return;
        }
        if (!session?.user) {
            toast({ variant: 'destructive', title: 'Not Authenticated', description: 'You must be logged in to schedule posts.' });
            return;
        }
        if (!scheduleDate) {
            toast({ variant: 'destructive', title: 'No Date Selected', description: 'Please select a date to schedule the post.' });
            return;
        }

        setIsScheduling(true);

        try {
            // Combine date and time
            const [hours, minutes] = scheduleTime.split(':').map(Number);
            const scheduledFor = new Date(scheduleDate);
            scheduledFor.setHours(hours, minutes, 0, 0);

            if (scheduledFor <= new Date()) {
                toast({ variant: 'destructive', title: 'Invalid Time', description: 'Scheduled time must be in the future.' });
                setIsScheduling(false);
                return;
            }

            const finalMedia = await uploadAllMedia();
            const finalMediaUrls = finalMedia.map(m => m.url);
            const finalMediaTypes = finalMedia.map(m => m.type);

            // Build platform configs
            const platforms = selectedAccountIds.map(accountId => {
                const account = accounts.find(a => a._id === accountId);
                if (!account) return null;

                const config: Record<string, unknown> = {
                    accountId: account._id,
                    platform: account.platform,
                    platformUsername: account.platformUsername,
                    content: platformCaptions[accountId] || caption,
                };

                if (account.platform === 'telegram') {
                    config.telegramChatIds = selectedTelegramChannels[accountId] || [];
                }

                if ((account.platform === 'x' || account.platform === 'threads') && threadEnabled) {
                    const parts = buildThreadParts();
                    if (parts.length > 1) {
                        config.isThread = true;
                        config.threadParts = parts;
                    }
                }

                if (account.platform === 'instagram' && instagramFirstComment.trim()) {
                    config.instagramFirstComment = instagramFirstComment.trim();
                }

                // Generic first comment (any comment-capable platform, Epic 1.5).
                if (firstComment.trim() && capabilityFor(account.platform)?.firstComment) {
                    config.firstComment = firstComment.trim();
                }

                // Per-platform advanced settings (Epic 1.5).
                const settings = platformSettings[account._id];
                if (settings && Object.keys(settings).length > 0) {
                    config.settings = settings;
                }

                return config;
            }).filter(Boolean);

            const response = await fetch('/api/social/posts/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId: selectedBrandId,
                    content: caption,
                    mediaUrls: finalMediaUrls,
                    mediaTypes: finalMediaTypes,
                    postFormat,
                    platforms,
                    scheduledFor: scheduledFor.toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    recurrence: buildRecurrence(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to schedule post');
            }

            toast({
                title: data.requiresApproval ? 'Submitted for approval' : 'Post scheduled',
                description: data.requiresApproval
                    ? 'This post is waiting for admin approval before it is scheduled.'
                    : `Your post will be published on ${format(scheduledFor, 'PPP')} at ${format(scheduledFor, 'p')}`
            });

            setShowScheduleDialog(false);
            push('/social/calendar');
        } catch (error: unknown) {
            console.error('Failed to schedule post:', error);
            toast({ variant: 'destructive', title: 'Failed to Schedule', description: getErrorMessage(error) });
        } finally {
            setIsScheduling(false);
        }
    }, [selectedAccountIds, accounts, caption, isUploadingMedia, platformCaptions, postFormat, session, push, toast, selectedBrandId, selectedTelegramChannels, scheduleDate, scheduleTime, uploadAllMedia, threadEnabled, buildThreadParts, instagramFirstComment, firstComment, capabilityFor, platformSettings, buildRecurrence]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (brands.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
                <AlertCircle className="size-12 text-muted-foreground" />
                <h3 className="text-xl font-semibold">No Brands Set Up</h3>
                <div className="text-muted-foreground text-center max-w-md space-y-4">
                    <p>Create a brand and connect social accounts before creating posts.</p>
                    <div className="text-left bg-muted/30 p-4 rounded-lg border text-sm">
                        <p className="font-medium mb-2 text-foreground">How to get started:</p>
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Go to <strong>Settings &gt; Connections</strong></li>
                            <li>Click <strong>New Brand</strong> and fill in the details</li>
                            <li><strong>Connect</strong> your social media accounts</li>
                        </ol>
                    </div>
                </div>
                <Button variant="brand" size="sm" icon={Building2} onClick={() => push('/settings?tab=connections')} className="mt-2">
                    Set Up Accounts
                </Button>
            </div>
        );
    }

    const composerPrimaryAction = (
        <Button variant="brand" size="sm" icon={isPublishing ? Loader2 : Send} onClick={handlePublish} disabled={isPublishing || selectedAccountIds.length === 0} className="min-w-[120px]">
            {isPublishing ? 'Publishing…' : 'Publish now'}
        </Button>
    );

    const composerSecondaryActions = (
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={Wand2} onClick={() => setShowAIAssistant(true)}>
                AI assistant
            </Button>
            <Button variant="ghost" size="sm" icon={Sparkles} onClick={handleSendToAgent}>
                Send to Agent
            </Button>
            <Button
                variant="ghost"
                size="sm"
                icon={isSavingDraft ? Loader2 : undefined}
                className="text-muted-foreground"
                onClick={handleSaveDraft}
                disabled={isSavingDraft || !selectedBrandId}
            >
                {isSavingDraft ? 'Saving…' : 'Save draft'}
            </Button>
            <Button variant="outline" size="sm" icon={FileSpreadsheet} onClick={() => push(selectedBrandId ? `/social/create-post/bulk?brandId=${selectedBrandId}` : '/social/create-post/bulk')}>
                Bulk planner
            </Button>
            <Button variant="outline" size="sm" icon={CalendarPlus} onClick={() => setShowScheduleDialog(true)} disabled={selectedAccountIds.length === 0}>
                Schedule
            </Button>
        </div>
    );

    return (
        <ModuleShell
            title="Composer"
            icon={PencilLine}
            editor
            breadcrumb={[{ label: 'Social', href: '/social' }, { label: 'Composer' }]}
            primaryAction={composerPrimaryAction}
            secondaryActions={composerSecondaryActions}
            contentClassName="min-h-0 flex-1"
        >
        <div className="flex flex-col gap-6 px-4 py-4 animate-in fade-in duration-500 pb-24 lg:px-6 lg:py-5">
            <Card className="overflow-hidden rounded-xl border border-border bg-card">
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <KitChip tone="gray">Composer summary</KitChip>
                                    <KitChip
                                        tone={
                                            summaryState.tone === 'critical'
                                                ? 'danger'
                                                : summaryState.tone === 'ready'
                                                    ? 'brand'
                                                    : 'gray'
                                        }
                                    >
                                        {summaryState.helperText}
                                    </KitChip>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Keep this compact while drafting, then expand when you want the extra publishing context.
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={isSummaryExpanded ? ChevronUp : ChevronDown}
                                className="self-start sm:self-auto"
                                onClick={() => setIsSummaryExpanded((current) => !current)}
                                aria-expanded={isSummaryExpanded}
                            >
                                {summaryState.toggleLabel}
                            </Button>
                        </div>

                        <div className="grid gap-2.5 sm:grid-cols-3">
                            <div className="rounded-xl border bg-background/70 px-3 py-2">
                                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Readiness</p>
                                <p className="mt-1.5 text-xl font-semibold leading-none">
                                    {composerInsights.score}
                                    <span className="text-xs text-muted-foreground">/100</span>
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">{composerInsights.readinessLabel}</p>
                            </div>
                            <div className="rounded-xl border bg-background/70 px-3 py-2">
                                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Selected</p>
                                <p className="mt-1.5 text-xl font-semibold leading-none">{selectedAccountIds.length}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {selectedAccountIds.length === 0 ? 'No accounts yet' : `${selectedPlatforms.length} channels active`}
                                </p>
                            </div>
                            <div className="rounded-xl border bg-background/70 px-3 py-2">
                                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Media Stack</p>
                                <p className="mt-1.5 text-xl font-semibold leading-none">{mediaFiles.length}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {imagesMissingAltText > 0 ? `${imagesMissingAltText} image${imagesMissingAltText === 1 ? '' : 's'} need alt text` : 'Accessibility in good shape'}
                                </p>
                            </div>
                        </div>

                        {isSummaryExpanded ? (
                            <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                                <div className="rounded-xl border border-border bg-card p-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Working context</p>
                                            <p className="mt-2 text-lg font-semibold">{selectedBrand?.name || 'Pick a brand'}</p>
                                        </div>
                                        <ShieldCheck className="size-5 text-muted-foreground" />
                                    </div>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Primary platform</p>
                                            <p className="mt-2 text-sm font-medium">{primaryPlatformConfig?.name || 'Not set'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Remaining characters</p>
                                            <p className="mt-2 text-sm font-medium">{composerInsights.stats.remainingPrimaryChars ?? 'Select an account'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last saved</p>
                                            <p className="mt-2 text-sm font-medium">{lastSaved ? format(lastSaved, 'p') : 'Not saved yet'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-border bg-card p-5">
                                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Next focus</p>
                                    <p className="mt-3 text-sm leading-6 text-foreground">
                                        {composerInsights.blockers[0] || composerInsights.warnings[0] || 'Everything critical is in place. You can keep drafting or publish when ready.'}
                                    </p>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </CardContent>
            </Card>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Left Column: Composer */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Brand Selection */}
                    <Card className="overflow-hidden border-border">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Building2 className="size-5 text-muted-foreground" />
                                Brand
                            </CardTitle>
                            <CardDescription>
                                Choose the brand context first so accounts, media, and scheduled posts stay scoped correctly.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                                <SelectTrigger className="h-12">
                                    <SelectValue placeholder="Select a brand" />
                                </SelectTrigger>
                                <SelectContent>
                                    {brands.map(brand => (
                                        <SelectItem key={brand._id} value={brand._id}>
                                            {brand.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border bg-muted/30 p-4">
                                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Handle</p>
                                    <p className="mt-2 text-sm font-semibold">{selectedBrand ? `@${selectedBrand.handle}` : 'Not selected'}</p>
                                </div>
                                <div className="rounded-2xl border bg-muted/30 p-4">
                                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Connected accounts</p>
                                    <p className="mt-2 text-sm font-semibold">{accounts.length}</p>
                                </div>
                                <div className="rounded-2xl border bg-muted/30 p-4">
                                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Draft status</p>
                                    <p className="mt-2 text-sm font-semibold">{currentDraftId ? 'Editing existing draft' : 'New post draft'}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Account Selection Card */}
                    <Card className="overflow-hidden border-border">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <LayoutGrid className="size-5 text-muted-foreground" />
                                        Select Accounts
                                    </CardTitle>
                                    <CardDescription className="mt-1">Choose connected accounts to publish to.</CardDescription>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="ghost" size="sm" icon={CheckCircle2} onClick={handleSelectAllAccounts} disabled={accounts.length === 0 || allAccountsSelected}>
                                        Select all
                                    </Button>
                                    <Button variant="ghost" size="sm" icon={XCircle} onClick={handleClearAccountSelection} disabled={selectedAccountIds.length === 0}>
                                        Clear
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        icon={Bookmark}
                                        onClick={() => setShowSaveSetDialog(true)}
                                        disabled={selectedAccountIds.length === 0}
                                    >
                                        Save as set
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="flex flex-wrap gap-2">
                                <KitChip tone="brand">{selectedAccountIds.length} selected</KitChip>
                                {primaryPlatformConfig && PrimaryPlatformIcon ? (
                                    <KitChip tone="gray">
                                        <PrimaryPlatformIcon className={cn('size-3', primaryPlatformConfig.color)} />
                                        Primary check: {primaryPlatformConfig.name}
                                    </KitChip>
                                ) : null}
                            </div>

                            {/* Saved channel sets quick-picker (Epic 1.2) */}
                            {channelSets.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <Bookmark className="size-3.5" />
                                        Sets:
                                    </span>
                                    {channelSets.map((set) => (
                                        <KitChip
                                            key={set._id}
                                            tone="gray"
                                            onClick={() => applyChannelSet(set)}
                                            className="cursor-pointer"
                                        >
                                            {set.name}
                                            <span className="ml-1 text-muted-foreground">({set.accountIds.length})</span>
                                        </KitChip>
                                    ))}
                                </div>
                            )}
                            {accounts.length === 0 ? (
                                <div className="rounded-2xl border border-dashed py-8 text-center text-muted-foreground">
                                    <p className="mb-2">No accounts connected to this brand.</p>
                                    <Button variant="outline" size="sm" onClick={() => push('/settings?tab=connections')}>
                                        Connect Accounts
                                    </Button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                                                        : 'border-border bg-background hover:border-primary/25 hover:bg-muted/40'
                                                )}
                                                type="button"
                                                onClick={() => toggleAccount(account._id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', config.bg)}>
                                                        <Icon className={cn("size-3.5", config.color)} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-semibold leading-tight">{account.platformDisplayName || `@${account.platformUsername}`}</p>
                                                        <p className="mt-0.5 text-[10px] text-muted-foreground">{config.name}</p>
                                                    </div>
                                                    {isSelected && (
                                                        <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                            <Check className="size-3" />
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Telegram Channel Selection */}
                            {accounts.filter(a => a.platform === 'telegram' && selectedAccountIds.includes(a._id)).map(account => (
                                <div key={`channels-${account._id}`} className="mt-4 p-4 rounded-lg border border-blue-400/20 bg-blue-400/5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <TelegramLogo className="size-4 text-blue-400" />
                                        <span className="text-sm font-medium">Select channels for @{account.platformUsername}</span>
                                    </div>
                                    {(!account.telegramChannels || account.telegramChannels.length === 0) ? (
                                        <div className="text-center py-4 text-muted-foreground">
                                            <p className="text-sm mb-2">No channels configured for this bot.</p>
                                            <Button variant="outline" size="sm" onClick={() => push('/settings?tab=connections')}>
                                                Add Channels
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {account.telegramChannels.map(channel => {
                                                const isChannelSelected = (selectedTelegramChannels[account._id] || []).includes(channel.chatId);
                                                return (
                                                    <KitChip
                                                        key={channel.chatId}
                                                        tone={isChannelSelected ? "info" : "gray"}
                                                        selected={isChannelSelected}
                                                        icon={isChannelSelected ? Check : undefined}
                                                        onClick={() => {
                                                            setSelectedTelegramChannels(prev => {
                                                                const current = prev[account._id] || [];
                                                                const updated = isChannelSelected
                                                                    ? current.filter(id => id !== channel.chatId)
                                                                    : [...current, channel.chatId];
                                                                return { ...prev, [account._id]: updated };
                                                            });
                                                        }}
                                                    >
                                                        {channel.type === 'channel' ? '#' : ''}{channel.title}
                                                    </KitChip>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Content Editor Card */}
                    <Card className="overflow-hidden border-border">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Type className="size-5 text-muted-foreground" />
                                Content
                            </CardTitle>
                            <CardDescription>
                                Shape the caption, add reusable assets, and let the page highlight what still needs attention.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-xl border bg-muted/30 p-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Primary limit</p>
                                        <Gauge className="size-3.5 text-muted-foreground" />
                                    </div>
                                    <p className="mt-1 text-sm font-semibold">{primaryPlatformConfig?.name || 'Select a platform'}</p>
                                    <p className="text-[11px] text-muted-foreground">{composerInsights.stats.remainingPrimaryChars ?? 'No limit visible yet'} remaining</p>
                                </div>
                                <div className="rounded-xl border bg-muted/30 p-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Media coverage</p>
                                        <ImagePlus className="size-3.5 text-muted-foreground" />
                                    </div>
                                    <p className="mt-1 text-sm font-semibold">{mediaFiles.length}/20 assets</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {composerInsights.stats.requiredMediaPlatforms > 0 ? 'Media required for some channels.' : 'Optional for current mix.'}
                                    </p>
                                </div>
                                <div className="rounded-xl border bg-muted/30 p-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Accessibility</p>
                                        <ShieldCheck className="size-3.5 text-muted-foreground" />
                                    </div>
                                    <p className="mt-1 text-sm font-semibold">
                                        {imagesMissingAltText === 0 ? 'Alt text covered' : `${imagesMissingAltText} image${imagesMissingAltText === 1 ? '' : 's'} pending`}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">Open image to edit alt text.</p>
                                </div>
                            </div>
                            <div className="rounded-2xl border bg-muted/20 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium">Post format</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Use <span className="font-medium">reel</span> for Instagram video publishing. Standard keeps image/feed behavior.
                                        </p>
                                    </div>
                                    <div className="w-full sm:w-[180px]">
                                        <Select value={postFormat} onValueChange={(value) => setPostFormat(value as 'standard' | 'reel')}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="standard">Standard post</SelectItem>
                                                <SelectItem value="reel">Reel</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                {hasVideoMedia ? (
                                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
                                        <Film className="size-3.5" />
                                        Video is attached. Instagram publishing requires reel format for this post.
                                    </div>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <label className="text-sm font-medium">Caption</label>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <NotionBrowser brandId={selectedBrandId} onSelectPage={handleImportFromNotion}>
                                            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground hover:text-brand">
                                                <NotionLogo className="size-3" />
                                                Import
                                            </Button>
                                        </NotionBrowser>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={Hash}
                                            className="h-8 text-xs text-muted-foreground hover:text-brand"
                                            onClick={() => setShowHashtagPanel(!showHashtagPanel)}
                                        >
                                            Hashtags
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={isEnhanceLoading ? Loader2 : Wand2}
                                            className="h-8 text-xs text-muted-foreground hover:text-brand"
                                            onClick={handleEnhanceContent}
                                            disabled={isEnhanceLoading || !caption?.trim()}
                                        >
                                            Enhance with AI
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={isVariantsLoading ? Loader2 : Layers}
                                            className="h-8 text-xs text-muted-foreground hover:text-brand"
                                            onClick={handleGenerateVariants}
                                            disabled={isVariantsLoading || !caption?.trim()}
                                        >
                                            Variants
                                        </Button>
                                    </div>
                                </div>
                                <Textarea
                                    placeholder="Write your post caption here..."
                                    className="min-h-[220px] resize-none rounded-[24px] border-border bg-background text-base shadow-inner p-4"
                                    value={caption}
                                    onChange={(e) => setCaption(e.target.value)}
                                />

                                {/* Platform Character Counters */}
                                <div className="space-y-2">
                                    {selectedAccountIds.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {selectedAccountIds.map(id => {
                                                const acc = accounts.find(a => a._id === id);
                                                if (!acc) return null;
                                                const platform = acc.platform as Platform;
                                                const limit = platformCharLimits[platform];
                                                const isOver = caption.length > limit;
                                                const config = platformConfig[platform];
                                                const Icon = config.icon;
                                                const percentage = Math.min((caption.length / limit) * 100, 100);

                                                return (
                                                    <div
                                                        key={id}
                                                        className={cn(
                                                            "flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors",
                                                            isOver ? "bg-red-500/10 text-red-600" : "bg-muted"
                                                        )}
                                                    >
                                                        <Icon className={cn("size-3", config.color)} />
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-10 h-1 bg-muted-foreground/20 rounded-full overflow-hidden">
                                                                <div
                                                                    className={cn("h-full rounded-full transition-all",
                                                                        isOver ? "bg-destructive" : "bg-primary"
                                                                    )}
                                                                    style={{ width: `${percentage}%` }}
                                                                />
                                                            </div>
                                                            <span className={isOver ? "font-medium" : ""}>
                                                                {caption.length}/{limit}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-muted-foreground">
                                            {(caption || '').length} characters • Select accounts to see limits
                                        </div>
                                    )}
                                </div>

                                {/* Hashtag Suggestions Panel */}
                                {showHashtagPanel && (
                                    <div className="animate-in slide-in-from-top-2 space-y-3 rounded-[22px] border bg-muted/50 p-4 duration-200">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium flex items-center gap-1.5">
                                                <Sparkles className="size-3.5 text-primary" />
                                                Suggested hashtag clusters
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={isHashtagLoading ? Loader2 : Sparkles}
                                                    className="h-7 text-xs text-muted-foreground hover:text-brand"
                                                    onClick={handleSuggestHashtags}
                                                    disabled={isHashtagLoading || !caption?.trim()}
                                                >
                                                    Suggest hashtags
                                                </Button>
                                                <Button variant="ghost" size="sm" icon={X} className="size-6 !px-0" onClick={() => setShowHashtagPanel(false)} />
                                            </div>
                                        </div>
                                        {aiHashtags.length > 0 && (
                                            <div>
                                                <p className="text-xs text-muted-foreground mb-1.5">AI suggestions</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {aiHashtags.map(tag => (
                                                        <KitChip
                                                            key={tag}
                                                            tone={caption.includes(tag) ? 'brand' : 'gray'}
                                                            onClick={() => handleAppendHashtag(tag)}
                                                            className="cursor-pointer"
                                                        >
                                                            {tag}
                                                            {caption.includes(tag) && <Check className="ml-1 size-2.5" />}
                                                        </KitChip>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {Object.entries(hashtagSuggestions).map(([category, tags]) => (
                                            <div key={category}>
                                                <p className="text-xs text-muted-foreground capitalize mb-1.5">{category}</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tags.map(tag => (
                                                        <KitChip
                                                            key={tag}
                                                            tone={caption.includes(tag) ? "brand" : "gray"}
                                                            selected={caption.includes(tag)}
                                                            icon={caption.includes(tag) ? Check : undefined}
                                                            onClick={() => {
                                                                if (!caption.includes(tag)) {
                                                                    setCaption(prev => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + tag);
                                                                }
                                                            }}
                                                        >
                                                            {tag}
                                                        </KitChip>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Thread composition (X / Threads) */}
                            {hasThreadablePlatform && (
                                <div className="rounded-2xl border bg-muted/20 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-start gap-2">
                                            <ListOrdered className="mt-0.5 size-4 text-muted-foreground" />
                                            <div>
                                                <p className="text-sm font-medium">Thread</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Split the caption into a numbered thread on X / Threads. Part 1 is the caption above.
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            variant={threadEnabled ? 'primary' : 'outline'}
                                            size="sm"
                                            onClick={() => setThreadEnabled((v) => !v)}
                                        >
                                            {threadEnabled ? 'Thread on' : 'Thread off'}
                                        </Button>
                                    </div>

                                    {threadEnabled && (
                                        <div className="mt-4 space-y-3">
                                            <div className="rounded-xl border bg-background/60 p-3">
                                                <div className="mb-1.5 flex items-center justify-between">
                                                    <span className="text-xs font-medium text-muted-foreground">Part 1 (caption)</span>
                                                    <span className={cn('text-[11px]', caption.length > platformCharLimits.x ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                                                        {caption.length}/{platformCharLimits.x}
                                                    </span>
                                                </div>
                                                <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                                                    {caption || <span className="italic text-muted-foreground">Write the main caption above…</span>}
                                                </p>
                                            </div>

                                            {threadParts.map((part, index) => (
                                                <div key={`thread-part-${index}`} className="rounded-xl border bg-background/60 p-3">
                                                    <div className="mb-1.5 flex items-center justify-between">
                                                        <span className="text-xs font-medium text-muted-foreground">Part {index + 2}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn('text-[11px]', part.length > platformCharLimits.x ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                                                                {part.length}/{platformCharLimits.x}
                                                            </span>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                icon={Trash2}
                                                                className="size-6 !px-0 text-muted-foreground hover:text-destructive"
                                                                onClick={() => removeThreadPart(index)}
                                                                title="Remove part"
                                                            />
                                                        </div>
                                                    </div>
                                                    <Textarea
                                                        value={part}
                                                        onChange={(e) => updateThreadPart(index, e.target.value)}
                                                        placeholder={`Thread part ${index + 2}…`}
                                                        className="min-h-[80px] resize-none"
                                                    />
                                                </div>
                                            ))}

                                            <Button variant="outline" size="sm" icon={Plus} onClick={addThreadPart}>
                                                Add part
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Instagram first comment */}
                            {hasInstagramAccount && (
                                <CollapsibleSection
                                    title="First comment (Instagram)"
                                    icon={MessageSquarePlus}
                                    defaultOpen={false}
                                >
                                    <p className="mb-2 text-xs text-muted-foreground">
                                        Posted as the first comment after publishing — common for keeping hashtags out of the caption.
                                    </p>
                                    <Textarea
                                        value={instagramFirstComment}
                                        onChange={(e) => setInstagramFirstComment(e.target.value)}
                                        placeholder="#hashtags or an opening comment…"
                                        className="min-h-[80px] resize-none"
                                    />
                                </CollapsibleSection>
                            )}

                            {/* Generic first comment — any comment-capable platform (Epic 1.5) */}
                            {hasFirstCommentPlatform && (
                                <CollapsibleSection
                                    title="First comment"
                                    icon={MessageSquarePlus}
                                    defaultOpen={false}
                                >
                                    <p className="mb-2 text-xs text-muted-foreground">
                                        Posted as the first comment on platforms that support it (e.g. LinkedIn, Instagram, X).
                                    </p>
                                    <Textarea
                                        value={firstComment}
                                        onChange={(e) => setFirstComment(e.target.value)}
                                        placeholder="Add a first comment for supported platforms…"
                                        className="min-h-[80px] resize-none"
                                    />
                                </CollapsibleSection>
                            )}

                            {/* Signatures picker (Epic 1.3) */}
                            {signatures.length > 0 && (
                                <CollapsibleSection
                                    title="Signature"
                                    icon={Signature}
                                    defaultOpen={false}
                                >
                                    <p className="mb-2 text-xs text-muted-foreground">
                                        Append a saved signature to the caption. Click again to remove it.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {signatures.map((sig) => (
                                            <KitChip
                                                key={sig._id}
                                                tone={appliedSignatureId === sig._id ? 'brand' : 'gray'}
                                                selected={appliedSignatureId === sig._id}
                                                icon={appliedSignatureId === sig._id ? Check : undefined}
                                                onClick={() => applySignature(sig)}
                                                className="cursor-pointer"
                                            >
                                                {sig.name}
                                                {sig.autoAdd ? <span className="ml-1 text-[10px] text-muted-foreground">(default)</span> : null}
                                            </KitChip>
                                        ))}
                                    </div>
                                </CollapsibleSection>
                            )}

                            {/* Per-platform settings (Epic 1.5) */}
                            {settingsCapableAccounts.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                        <Settings2 className="size-4 text-muted-foreground" />
                                        Platform settings
                                    </div>
                                    {settingsCapableAccounts.map((account) => {
                                        const cfg = platformConfig[account.platform as Platform];
                                        const title = `${cfg?.name || account.platform} · @${account.platformUsername}`;
                                        return (
                                            <CollapsibleSection
                                                key={`settings-${account._id}`}
                                                title={title}
                                                icon={Settings2}
                                                defaultOpen={false}
                                            >
                                                {renderPlatformSettings(account)}
                                            </CollapsibleSection>
                                        );
                                    })}
                                </div>
                            )}

                            <Separator />

                            {/* Media Upload */}
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <label className="text-sm font-medium">Media</label>
                                        <p className="mt-1 text-xs text-muted-foreground">Upload images or videos. Use reel format for Instagram video publishing.</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <KitChip tone="gray">{mediaFiles.length}/20</KitChip>
                                        <KitChip tone={imagesMissingAltText > 0 ? 'warn' : 'ok'}>
                                            {imagesMissingAltText > 0 ? `${imagesMissingAltText} alt text missing` : 'Alt text complete'}
                                        </KitChip>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setLibraryDialogOpen(true)}
                                            disabled={!selectedBrandId}
                                        >
                                            Choose from library
                                        </Button>
                                        {/* AI slideshow→video generator (Epic 4.3) */}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            icon={Clapperboard}
                                            onClick={() => setSlideshowDialogOpen(true)}
                                            disabled={!selectedBrandId}
                                        >
                                            AI slideshow
                                        </Button>
                                    </div>
                                </div>

                                {/* Carousel honesty hint */}
                                {imageMediaCount > 1 && (
                                    <div className="flex items-start gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
                                        <Layers className="mt-0.5 size-3.5 shrink-0" />
                                        <span>
                                            {hasCarouselPlatform
                                                ? 'X / Instagram carousel uses up to 10 images; other platforms post the first image only.'
                                                : 'The selected platforms post the first image only.'}
                                        </span>
                                    </div>
                                )}

                                {/* Per-platform maxMedia warning (Epic 1.5, capability-driven) */}
                                {carouselOverLimit && carouselMaxAcrossPlatforms != null && (
                                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                        <span>
                                            You attached {mediaFiles.length} items, but one or more selected platforms accept at most{' '}
                                            {carouselMaxAcrossPlatforms}. Extra items will be dropped on those platforms.
                                        </span>
                                    </div>
                                )}

                                {/* Media Gallery */}
                                {mediaFiles.length > 0 && (
                                    <div className="grid grid-cols-2 gap-3 mb-3 md:grid-cols-3">
                                        {mediaFiles.map((media, idx) => (
                                            <div
                                                key={media.id}
                                                role="button"
                                                tabIndex={0}
                                                className="relative group aspect-square rounded-[22px] overflow-hidden border bg-muted cursor-pointer"
                                                onClick={() => {
                                                    setSelectedMediaId(media.id);
                                                    setAltTextInput(media.altText || '');
                                                    setMediaDialogOpen(true);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setSelectedMediaId(media.id);
                                                        setAltTextInput(media.altText || '');
                                                        setMediaDialogOpen(true);
                                                    }
                                                }}
                                                aria-label={`Edit media ${idx + 1}`}
                                            >
                                                {media.type === 'image' ? (
                                                    <NextImage
                                                        src={media.url}
                                                        alt={media.altText || `Media ${idx + 1}`}
                                                        fill
                                                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                                                    />
                                                ) : (
                                                    <video src={media.url} className="w-full h-full object-cover" aria-label={`Video media ${idx + 1}`} />
                                                )}
                                                <div className="absolute left-3 top-3 flex size-7 items-center justify-center rounded-full bg-black/70 text-xs text-white">
                                                    {idx + 1}
                                                </div>
                                                {media.type === 'image' && !media.altText?.trim() ? (
                                                    <div className="absolute bottom-3 left-3 rounded-full bg-amber-500/90 px-2 py-1 text-[11px] font-medium text-black">
                                                        Alt text needed
                                                    </div>
                                                ) : null}
                                                {media.type === 'video' ? (
                                                    <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
                                                        <Film className="size-3" />
                                                        Video
                                                    </div>
                                                ) : null}
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    {idx > 0 && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="size-7 !px-0"
                                                            onClick={(e) => moveMedia(media.id, 'up', e)}
                                                        >
                                                            ←
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        icon={X}
                                                        className="size-7 !px-0 text-destructive hover:text-destructive"
                                                        onClick={(e) => removeMedia(media.id, e)}
                                                    />
                                                    {idx < mediaFiles.length - 1 && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="size-7 !px-0"
                                                            onClick={(e) => moveMedia(media.id, 'down', e)}
                                                        >
                                                            →
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Upload zone */}
                                <div
                                    role="button"
                                    tabIndex={0}
                                    aria-label="Upload media files"
                                    className={cn(
                                        "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                                        mediaFiles.length >= 20
                                            ? "border-muted-foreground/10 bg-muted/50 cursor-not-allowed"
                                            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5"
                                    )}
                                    onClick={() => mediaFiles.length < 20 && fileInputRef.current?.click()}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            if (mediaFiles.length < 20) fileInputRef.current?.click();
                                        }
                                    }}
                                >
                                    {mediaFiles.length >= 20 ? (
                                        <p className="text-sm text-muted-foreground">Maximum 20 files reached</p>
                                    ) : (
                                        <>
                                            <Plus className="size-8 mx-auto mb-2 text-muted-foreground/50" />
                                            <p className="text-sm text-muted-foreground">
                                                {mediaFiles.length === 0 ? 'Click to upload images or videos' : 'Add more media'}
                                            </p>
                                            <p className="text-xs text-muted-foreground/70 mt-1">
                                                Or choose existing library media
                                            </p>
                                        </>
                                    )}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*,video/*"
                                        multiple
                                        className="hidden"
                                        onChange={handleFileChange}
                                        disabled={mediaFiles.length >= 20}
                                        aria-label="Upload images or videos"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Preview */}
                <div className="lg:col-span-1">
                    <div className="sticky top-20 space-y-4">
                        <Card className="overflow-hidden border-border">
                            <CardHeader className="border-b bg-muted/20 pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Gauge className="size-4 text-muted-foreground" />
                                        Post Health
                                    </CardTitle>
                                    <span className="text-xs font-semibold">{composerInsights.score}/100</span>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-4">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">{composerInsights.readinessLabel}</span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className={cn(
                                                'h-full rounded-full transition-all',
                                                composerInsights.score >= 80 ? 'bg-primary' : composerInsights.score >= 50 ? 'bg-primary/60' : 'bg-destructive'
                                            )}
                                            style={{ width: `${composerInsights.score}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                                    <div className="rounded-xl border bg-muted/30 p-2.5">
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Platform conflicts</p>
                                        <p className="mt-0.5 text-sm font-semibold">{composerInsights.stats.overLimitPlatforms}</p>
                                    </div>
                                    <div className="rounded-xl border bg-muted/30 p-2.5">
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Missing alt text</p>
                                        <p className="mt-0.5 text-sm font-semibold">{composerInsights.stats.imagesMissingAltText}</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {composerInsights.blockers.length > 0 ? (
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Blockers</p>
                                            {composerInsights.blockers.map((item) => (
                                                <div key={item} className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-300">
                                                    <AlertTriangle className="mt-0.5 size-3.5" />
                                                    <span>{item}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-2 text-xs text-primary">
                                            <CheckCircle2 className="mt-0.5 size-3.5" />
                                            <span>No hard blockers detected.</span>
                                        </div>
                                    )}

                                    {composerInsights.warnings.length > 0 ? (
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Warnings</p>
                                            {composerInsights.warnings.map((item) => (
                                                <div key={item} className="flex items-start gap-2 rounded-xl border border-border bg-secondary p-2 text-xs text-muted-foreground">
                                                    <Clock3 className="mt-0.5 size-3.5" />
                                                    <span>{item}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="overflow-hidden border-border">
                            <CardHeader className="border-b bg-muted/20 pb-2">
                                <CardTitle className="text-base">Publishing Footprint</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-3">
                                {selectedAccounts.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Select accounts to see footprint.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedAccounts.map((account) => {
                                            const config = platformConfig[account.platform as Platform];
                                            if (!config) return null;
                                            const Icon = config.icon;

                                            return (
                                                <KitChip key={account._id} tone="gray" className="text-[10px]">
                                                    <Icon className={cn('size-2.5', config.color)} />
                                                    @{account.platformUsername}
                                                </KitChip>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Revision history (Epic 8) — only when editing an existing draft */}
                        {currentDraftId ? (
                            <CollapsibleSection
                                title="History"
                                icon={History}
                                defaultOpen={false}
                            >
                                <RevisionHistoryPanel subjectType="draft" subjectId={currentDraftId} />
                            </CollapsibleSection>
                        ) : null}

                        <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">Live Preview</h3>
                        <div className="max-h-[calc(100vh-200px)] overflow-y-auto pr-2 pb-10">
                            {selectedAccountIds.length === 0 ? (
                                <Card className="p-8 text-center text-muted-foreground">
                                    <LayoutGrid className="size-10 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">Select accounts to see preview</p>
                                </Card>
                            ) : (
                                selectedAccountIds.map(accountId => {
                                    const account = accounts.find(a => a._id === accountId);
                                    if (!account) return null;
                                    return (
                                        <SocialPreview
                                            key={accountId}
                                            platform={account.platform as Platform}
                                            caption={platformCaptions[accountId] || caption}
                                            mediaPreview={primaryMediaPreview}
                                            brandName={selectedBrand?.name || 'Brand'}
                                            brandHandle={selectedBrand?.handle || 'handle'}
                                            isOverridden={!!platformCaptions[accountId]}
                                            isEnhancing={isEnhancingPlatform[accountId]}
                                            onEdit={() => {
                                                setEditingPlatformId(accountId);
                                                setPlatformCaptionInput(platformCaptions[accountId] || caption);
                                            }}
                                            onEnhance={() => handleEnhancePlatformCaption(accountId)}
                                            onClear={() => {
                                                setPlatformCaptions(prev => {
                                                    const newState = { ...prev };
                                                    delete newState[accountId];
                                                    return newState;
                                                });
                                            }}
                                        />
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={libraryDialogOpen} onOpenChange={setLibraryDialogOpen}>
                <DialogContent className="sm:max-w-[760px]">
                    <DialogHeader>
                        <DialogTitle>Choose from media library</DialogTitle>
                        <DialogDescription>
                            Select existing brand media or browse connected Google Drive media for this brand.
                        </DialogDescription>
                    </DialogHeader>
                    <Tabs value={mediaPickerTab} onValueChange={(value) => setMediaPickerTab(value as 'library' | 'drive')} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="library">Library</TabsTrigger>
                            <TabsTrigger value="drive" disabled={!connectedDriveProvider}>Google Drive</TabsTrigger>
                        </TabsList>

                        <TabsContent value="library" className="max-h-[60vh] overflow-y-auto pr-1">
                            {isLibraryLoading ? (
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                    {Array.from({ length: 6 }).map((_, index) => (
                                        <div key={`skeleton-${index}`} className="aspect-square animate-pulse rounded-lg bg-muted" />
                                    ))}
                                </div>
                            ) : libraryAssets.length > 0 ? (
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                    {libraryAssets.map((asset) => {
                                        const alreadyAdded = mediaFiles.some((media) => media.assetId === asset._id);

                                        return (
                                            <button
                                                key={asset._id}
                                                type="button"
                                                className={cn(
                                                    'group relative aspect-square overflow-hidden rounded-lg border bg-muted text-left transition-colors',
                                                    alreadyAdded && 'border-primary ring-2 ring-primary/30',
                                                )}
                                                onClick={() => addLibraryMedia(asset)}
                                                disabled={alreadyAdded}
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
                                                        muted
                                                        aria-label={asset.originalName}
                                                    />
                                                )}
                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-white">
                                                    <p className="truncate text-xs font-medium">{asset.originalName}</p>
                                                    <p className="text-[10px] text-white/70">
                                                        {alreadyAdded ? 'Already added' : 'Add to post'}
                                                    </p>
                                                </div>
                                                {asset.type === 'video' ? (
                                                    <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">
                                                        <Film className="size-3" />
                                                        Video
                                                    </div>
                                                ) : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                                    No media assets found for this brand yet.
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="drive" className="space-y-4">
                            {connectedDriveProvider ? (
                                <>
                                    <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                                        <p>
                                            Connected Drive folder:
                                            {' '}
                                            <span className="font-medium text-foreground">
                                                {getBrandMediaStorageFolder({
                                                    brandId: selectedBrandId,
                                                    brandHandle: selectedBrand?.handle,
                                                })}
                                            </span>
                                        </p>
                                        <p className="mt-1 text-xs">
                                            Media uploaded to the brand Drive destination appears here.
                                        </p>
                                    </div>

                                    <div className="max-h-[52vh] overflow-y-auto pr-1">
                                        {isDriveFilesLoading ? (
                                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                                {Array.from({ length: 6 }).map((_, index) => (
                                                    <div key={`skeleton-${index}`} className="aspect-square animate-pulse rounded-lg bg-muted" />
                                                ))}
                                            </div>
                                        ) : driveFiles.length > 0 ? (
                                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                                {driveFiles.map((file) => {
                                                    const remoteId = `drive-${file.key}`;
                                                    const alreadyAdded = mediaFiles.some((media) => media.id === remoteId);

                                                    return (
                                                        <button
                                                            key={file.key}
                                                            type="button"
                                                            className={cn(
                                                                'group relative aspect-square overflow-hidden rounded-lg border bg-muted text-left transition-colors',
                                                                alreadyAdded && 'border-primary ring-2 ring-primary/30',
                                                            )}
                                                            onClick={() => addDriveMedia(file)}
                                                            disabled={alreadyAdded}
                                                        >
                                                            {file.contentType.startsWith('video/') ? (
                                                                <video
                                                                    src={file.url}
                                                                    className="h-full w-full object-cover"
                                                                    muted
                                                                    aria-label={file.name}
                                                                />
                                                            ) : (
                                                                <NextImage
                                                                    src={file.url}
                                                                    alt={file.name}
                                                                    fill
                                                                    className="object-cover"
                                                                />
                                                            )}
                                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-white">
                                                                <p className="truncate text-xs font-medium">{file.name}</p>
                                                                <p className="text-[10px] text-white/70">
                                                                    {alreadyAdded ? 'Already added' : 'Add to post'}
                                                                </p>
                                                            </div>
                                                            {file.contentType.startsWith('video/') ? (
                                                                <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">
                                                                    <Film className="size-3" />
                                                                    Video
                                                                </div>
                                                            ) : null}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                                                No media files found in the connected Google Drive brand folder yet.
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                                    Connect Google Drive in settings to browse Drive media here.
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLibraryDialogOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Schedule Dialog */}
            <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarPlus className="size-5" />
                            Schedule Post
                        </DialogTitle>
                        <DialogDescription>
                            Choose when you want this post to be published.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        {/* Suggested times (best-time-to-post). Skipped silently while
                            loading/on error and when no slots are available. */}
                        {suggestedTimes && suggestedTimes.chips.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-sm font-medium">
                                    <Sparkles className="size-4 text-brand" />
                                    {suggestedTimes.fallback ? 'Popular posting times' : 'Best for your audience'}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {suggestedTimes.chips.map((chip) => (
                                        <KitChip
                                            key={chip.key}
                                            onClick={() => applySuggestedTime(chip.date)}
                                        >
                                            {format(chip.date, 'EEE HH:mm')}
                                        </KitChip>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Date Picker */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Date</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        icon={CalendarPlus}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !scheduleDate && "text-muted-foreground"
                                        )}
                                    >
                                        {scheduleDate ? format(scheduleDate, 'PPP') : 'Pick a date'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={scheduleDate}
                                        onSelect={setScheduleDate}
                                        disabled={(date) => date < new Date()}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Time Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Time</label>
                            <input
                                type="time"
                                value={scheduleTime}
                                onChange={(e) => setScheduleTime(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Schedule time"
                            />
                        </div>

                        {/* Repeat / recurrence (Epic 1.1) */}
                        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                            <div className="flex items-center justify-between gap-3">
                                <label className="flex items-center gap-1.5 text-sm font-medium">
                                    <Repeat className="size-4 text-muted-foreground" />
                                    Repeat
                                </label>
                                <div className="w-[150px]">
                                    <Select value={recurFrequency} onValueChange={(v) => setRecurFrequency(v as 'off' | 'daily' | 'weekly' | 'monthly')}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="off">Does not repeat</SelectItem>
                                            <SelectItem value="daily">Daily</SelectItem>
                                            <SelectItem value="weekly">Weekly</SelectItem>
                                            <SelectItem value="monthly">Monthly</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {recurFrequency !== 'off' && (
                                <>
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-muted-foreground">Every</span>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={String(recurInterval)}
                                            onChange={(e) => setRecurInterval(Math.max(1, Number(e.target.value) || 1))}
                                            className="w-16"
                                            aria-label="Repeat interval"
                                        />
                                        <span className="text-muted-foreground">
                                            {recurFrequency === 'daily' ? 'day(s)' : recurFrequency === 'weekly' ? 'week(s)' : 'month(s)'}
                                        </span>
                                    </div>

                                    {recurFrequency === 'weekly' && (
                                        <div className="space-y-1.5">
                                            <p className="text-xs text-muted-foreground">On days</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
                                                    const on = recurDaysOfWeek.includes(idx);
                                                    return (
                                                        <KitChip
                                                            key={day}
                                                            tone={on ? 'brand' : 'gray'}
                                                            selected={on}
                                                            onClick={() =>
                                                                setRecurDaysOfWeek((prev) =>
                                                                    prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx],
                                                                )
                                                            }
                                                            className="cursor-pointer"
                                                        >
                                                            {day}
                                                        </KitChip>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <p className="text-xs text-muted-foreground">End date (optional)</p>
                                        <Input
                                            type="date"
                                            value={recurEndDate}
                                            onChange={(e) => setRecurEndDate(e.target.value)}
                                            aria-label="Recurrence end date"
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Preview */}
                        {scheduleDate && (
                            <div className="p-3 bg-muted/50 rounded-lg text-sm text-center">
                                <p className="text-muted-foreground">Your post will be published:</p>
                                <p className="font-medium mt-1">
                                    {format(scheduleDate, 'EEEE, MMMM do, yyyy')} at {scheduleTime}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
                            Cancel
                        </Button>
                        <Button variant="brand" icon={isScheduling ? Loader2 : CalendarPlus} onClick={handleSchedule} disabled={isScheduling || !scheduleDate}>
                            {isScheduling ? 'Scheduling…' : 'Schedule Post'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Media Viewer / Alt Text Dialog */}
            <Dialog open={mediaDialogOpen} onOpenChange={setMediaDialogOpen}>
                <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b shrink-0">
                        <DialogTitle>Edit Media</DialogTitle>
                        <DialogDescription>
                            Add alt text to make your images accessible to everyone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col md:flex-row gap-6">
                        <div className="md:w-1/2 rounded-md overflow-hidden bg-muted flex items-center justify-center relative min-h-[250px] max-h-[400px]">
                            {selectedMediaId && mediaFiles.find(m => m.id === selectedMediaId)?.type === 'image' ? (
                                <NextImage
                                    src={mediaFiles.find(m => m.id === selectedMediaId)?.url || ''}
                                    alt="Preview"
                                    fill
                                    className="object-contain"
                                />
                            ) : null}
                            {selectedMediaId && mediaFiles.find(m => m.id === selectedMediaId)?.type === 'video' ? (
                                <video
                                    src={mediaFiles.find(m => m.id === selectedMediaId)?.url || ''}
                                    className="h-full w-full object-contain"
                                    controls
                                    aria-label="Selected video preview"
                                />
                            ) : null}
                        </div>
                        <div className="md:w-1/2 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Alt Text</label>
                                <Textarea
                                    value={altTextInput}
                                    onChange={e => setAltTextInput(e.target.value)}
                                    placeholder="Describe this image for users with screen readers..."
                                    className="resize-none h-32"
                                    disabled={selectedMediaId ? mediaFiles.find(m => m.id === selectedMediaId)?.type === 'video' : false}
                                />
                                {selectedMediaId && mediaFiles.find(m => m.id === selectedMediaId)?.type === 'video' ? (
                                    <p className="text-xs text-muted-foreground">Alt text is currently available for image posts only.</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="p-4 border-t shrink-0">
                        <Button variant="outline" onClick={() => setMediaDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveAltText} disabled={selectedMediaId ? mediaFiles.find(m => m.id === selectedMediaId)?.type === 'video' : false}>
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <SocialAIAssistantDialog
                open={showAIAssistant}
                onOpenChange={setShowAIAssistant}
                onSelectIdea={setCaption}
                platforms={selectedAccountIds.map(id => accounts.find(a => a._id === id)?.platform || 'general')}
                brandId={selectedBrandId || undefined}
            />

            {/* AI slideshow→video generator dialog (Epic 4.3) */}
            <FormDialog
                open={slideshowDialogOpen}
                onOpenChange={setSlideshowDialogOpen}
                title="AI slideshow"
                description="Turn a topic or short script into a narrated slideshow video. This can take a minute while images, voiceover and video render."
                icon={Clapperboard}
                onSubmit={handleGenerateSlideshow}
                submitLabel={isGeneratingSlideshow ? 'Generating…' : 'Generate video'}
                submitting={isGeneratingSlideshow}
                submitDisabled={!selectedBrandId || !slideshowTopic.trim()}
            >
                <Field label="Topic or script" required>
                    <KitTextarea
                        value={slideshowTopic}
                        onChange={(e) => setSlideshowTopic(e.target.value)}
                        placeholder="e.g. 5 quick tips for first-time home buyers"
                        rows={5}
                        disabled={isGeneratingSlideshow}
                    />
                </Field>
                <Field label="Slides" hint="Between 2 and 10 slides.">
                    <Input
                        type="number"
                        min={2}
                        max={10}
                        value={slideshowSlideCount}
                        onChange={(e) => setSlideshowSlideCount(e.target.value)}
                        disabled={isGeneratingSlideshow}
                    />
                </Field>
            </FormDialog>

            {/* Platform Caption Edit Dialog */}
            <Dialog open={!!editingPlatformId} onOpenChange={(open) => !open && setEditingPlatformId(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Pencil className="size-4" />
                            Customize Caption
                        </DialogTitle>
                        <DialogDescription>
                            Override the global caption for {editingPlatformId ? platformConfig[accounts.find(a => a._id === editingPlatformId)?.platform as Platform]?.name : ''}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea
                            value={platformCaptionInput}
                            onChange={(e) => setPlatformCaptionInput(e.target.value)}
                            placeholder="Write a custom caption for this platform..."
                            className="min-h-[150px] resize-none"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingPlatformId(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSavePlatformCaption}>
                            Save Override
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Caption Variants Dialog */}
            <Dialog open={showVariantsDialog} onOpenChange={setShowVariantsDialog}>
                <DialogContent className="sm:max-w-[640px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Layers className="size-4" />
                            Caption variants
                        </DialogTitle>
                        <DialogDescription>
                            Pick a variant to apply to the caption. The original is kept for comparison.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] space-y-3 overflow-y-auto py-2">
                        {captionVariants.map((variant) => (
                            <button
                                key={variant.label}
                                type="button"
                                onClick={() => applyVariant(variant.content)}
                                className="group w-full rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                            >
                                <div className="mb-1.5 flex items-center justify-between">
                                    <KitChip tone={variant.label === 'Original' ? 'gray' : 'brand'}>{variant.label}</KitChip>
                                    <span className="text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                                        Click to apply
                                    </span>
                                </div>
                                <p className="whitespace-pre-wrap break-words text-sm text-foreground">{variant.content}</p>
                            </button>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowVariantsDialog(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Save channel set Dialog (Epic 1.2) */}
            <Dialog open={showSaveSetDialog} onOpenChange={setShowSaveSetDialog}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Bookmark className="size-4" />
                            Save channel set
                        </DialogTitle>
                        <DialogDescription>
                            Save the current account selection ({selectedAccountIds.length}) as a reusable set.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Field label="Set name">
                            <Input
                                value={newSetName}
                                onChange={(e) => setNewSetName(e.target.value)}
                                placeholder="e.g. All channels"
                                aria-label="Channel set name"
                            />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSaveSetDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="brand"
                            icon={isSavingSet ? Loader2 : Bookmark}
                            onClick={handleSaveSet}
                            disabled={isSavingSet || !newSetName.trim() || selectedAccountIds.length === 0}
                        >
                            {isSavingSet ? 'Saving…' : 'Save set'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
        </ModuleShell>
    );
}
// Force rebuild: 1
