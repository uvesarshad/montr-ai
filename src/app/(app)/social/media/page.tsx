'use client';

import Link from 'next/link';
import NextImage from 'next/image';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ModuleShell } from '@/components/shell/module-shell';
import {
    Button,
    Card,
    Chip as KitChip,
    EmptyState,
    Field as KitField,
    FormDialog,
    Input as KitInput,
    Select as KitSelect,
    Skeleton,
    Textarea as KitTextarea,
} from '@/components/ui-kit';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
    buildCreateMediaAssetPayload,
    buildTagSummary,
    calculateSelectionSummary,
    countRecentAssets,
    parseMediaTags,
    filterImportableStorageFiles,
    getBrandMediaStorageFolder,
    sortMediaAssets,
    type MediaAssetSort,
} from '@/lib/social/media-library';
import { cn } from '@/lib/utils';
import {
    Check,
    Copy,
    Edit,
    FileImage,
    Film,
    Folder,
    FolderPlus,
    Grid,
    HardDrive,
    Image as ImageIcon,
    List,
    Loader2,
    MoreVertical,
    RefreshCw,
    Search,
    Sparkles,
    Tag,
    Trash2,
    Upload,
    Video,
    X,
} from 'lucide-react';

const AI_ASPECT_RATIOS = [
    { value: '1:1', label: 'Square (1:1)' },
    { value: '16:9', label: 'Landscape (16:9)' },
    { value: '9:16', label: 'Portrait (9:16)' },
    { value: '4:3', label: 'Standard (4:3)' },
    { value: '3:4', label: 'Vertical (3:4)' },
] as const;

type AiAspectRatio = (typeof AI_ASPECT_RATIOS)[number]['value'];

interface Brand {
    _id: string;
    name: string;
    handle: string;
}

interface MediaAsset {
    _id: string;
    brandId: string;
    url: string;
    thumbnailUrl?: string;
    type: 'image' | 'video';
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    folderId?: string | null;
    tags: string[];
    altText?: string;
    usageCount: number;
    createdAt: string;
}

interface MediaFolder {
    _id: string;
    name: string;
    parentId?: string;
    color: string;
    assetCount: number;
}

interface Stats {
    totalAssets: number;
    totalSize: number;
    imageCount: number;
    videoCount: number;
}

interface FolderFormState {
    mode: 'create' | 'edit';
    folderId?: string;
    name: string;
    color: string;
}

interface UploadCandidate {
    id: string;
    file: File;
    previewUrl: string;
    type: 'image' | 'video';
    width?: number;
    height?: number;
    duration?: number;
}

interface StorageProviderOption {
    id: string;
    name: string;
    email?: string;
    provider: 'aws' | 'wasabi' | 'google-drive' | 'local';
    isDefault: boolean;
    usedBytes?: number;
    quotaBytes?: number;
}

interface StorageFileItem {
    key: string;
    url: string;
    name: string;
    size: number;
    contentType: string;
    lastModified: string | Date;
}

const EMPTY_STATS: Stats = {
    totalAssets: 0,
    totalSize: 0,
    imageCount: 0,
    videoCount: 0,
};

const ROOT_FOLDER_VALUE = '__root__';

export default function MediaLibraryPage() {
    const { toast } = useToast();

    const [brands, setBrands] = useState<Brand[]>([]);
    const [selectedBrandId, setSelectedBrandId] = useState('');
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [folders, setFolders] = useState<MediaFolder[]>([]);
    const [stats, setStats] = useState<Stats>(EMPTY_STATS);
    const [isBrandsLoading, setIsBrandsLoading] = useState(true);
    const [isLibraryLoading, setIsLibraryLoading] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<MediaAssetSort>('newest');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());

    const [folderDialogOpen, setFolderDialogOpen] = useState(false);
    const [folderForm, setFolderForm] = useState<FolderFormState>({
        mode: 'create',
        name: '',
        color: '#4f46e5',
    });
    const [isSavingFolder, setIsSavingFolder] = useState(false);

    const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
    const [assetFolderValue, setAssetFolderValue] = useState(ROOT_FOLDER_VALUE);
    const [assetTagsInput, setAssetTagsInput] = useState('');
    const [assetAltText, setAssetAltText] = useState('');
    const [isSavingAsset, setIsSavingAsset] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [uploadCandidates, setUploadCandidates] = useState<UploadCandidate[]>([]);
    const [uploadFolderValue, setUploadFolderValue] = useState(ROOT_FOLDER_VALUE);
    const [uploadTagsInput, setUploadTagsInput] = useState('');
    const [uploadAltText, setUploadAltText] = useState('');
    const [isUploadingAssets, setIsUploadingAssets] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0, currentFileName: '' });
    const [storageProviders, setStorageProviders] = useState<StorageProviderOption[]>([]);
    const [selectedUploadProviderId, setSelectedUploadProviderId] = useState('default');
    const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
    const [generatePrompt, setGeneratePrompt] = useState('');
    const [generateAspectRatio, setGenerateAspectRatio] = useState<AiAspectRatio>('1:1');
    const [driveImportDialogOpen, setDriveImportDialogOpen] = useState(false);
    const [driveFiles, setDriveFiles] = useState<StorageFileItem[]>([]);
    const [selectedDriveKeys, setSelectedDriveKeys] = useState<Set<string>>(new Set());
    const [isDriveFilesLoading, setIsDriveFilesLoading] = useState(false);
    const [isImportingDriveFiles, setIsImportingDriveFiles] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearchQuery(searchQuery.trim());
        }, 250);

        return () => window.clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        if (!selectedAsset) {
            return;
        }

        setAssetFolderValue(selectedAsset.folderId || ROOT_FOLDER_VALUE);
        setAssetTagsInput(selectedAsset.tags.join(', '));
        setAssetAltText(selectedAsset.altText || '');
    }, [selectedAsset]);

    useEffect(() => {
        if (uploadDialogOpen) {
            return;
        }

        setUploadCandidates((current) => {
            current.forEach((candidate) => URL.revokeObjectURL(candidate.previewUrl));
            return [];
        });
        setUploadFolderValue(ROOT_FOLDER_VALUE);
        setUploadTagsInput('');
        setUploadAltText('');
        setUploadProgress({ completed: 0, total: 0, currentFileName: '' });
    }, [uploadDialogOpen]);

    useEffect(() => {
        if (!selectedBrandId) {
            setStorageProviders([]);
            setSelectedUploadProviderId('default');
            return;
        }

        async function fetchStorageProviders() {
            try {
                const response = await fetch(`/api/storage/upload?brandId=${selectedBrandId}`);
                if (!response.ok) {
                    throw new Error('Failed to load storage providers');
                }

                const data = await response.json();
                const providers = (data.providers || []) as StorageProviderOption[];
                setStorageProviders(providers);
                setSelectedUploadProviderId((current) =>
                    providers.some((provider) => provider.id === current) ? current : 'default',
                );
            } catch (error) {
                toast({
                    variant: 'destructive',
                    title: 'Failed to load storage providers',
                    description: getErrorMessage(error),
                });
            }
        }

        fetchStorageProviders();
    }, [selectedBrandId, toast]);

    useEffect(() => {
        async function fetchBrands() {
            setIsBrandsLoading(true);
            try {
                const response = await fetch('/api/social/brands');
                if (!response.ok) {
                    throw new Error('Failed to fetch brands');
                }

                const data = await response.json();
                const nextBrands = data.brands || [];
                setBrands(nextBrands);

                const savedBrandId = window.localStorage.getItem('social-media-library-brand');
                if (savedBrandId && nextBrands.some((brand: Brand) => brand._id === savedBrandId)) {
                    setSelectedBrandId(savedBrandId);
                } else if (nextBrands.length > 0) {
                    setSelectedBrandId(nextBrands[0]._id);
                }
            } catch (error) {
                console.error('Failed to fetch brands:', error);
                toast({ variant: 'destructive', title: 'Failed to load brands' });
            } finally {
                setIsBrandsLoading(false);
            }
        }

        fetchBrands();
    }, [toast]);

    useEffect(() => {
        if (!selectedBrandId) {
            return;
        }

        window.localStorage.setItem('social-media-library-brand', selectedBrandId);
    }, [selectedBrandId]);

    const fetchMedia = useCallback(async () => {
        if (!selectedBrandId) {
            setAssets([]);
            setFolders([]);
            setStats(EMPTY_STATS);
            setIsLibraryLoading(false);
            return;
        }

        setIsLibraryLoading(true);
        try {
            const foldersResponse = await fetch(`/api/social/media/folders?brandId=${selectedBrandId}`);
            if (!foldersResponse.ok) {
                throw new Error('Failed to fetch folders');
            }
            const foldersData = await foldersResponse.json();
            setFolders(foldersData.folders || []);

            const params = new URLSearchParams({ brandId: selectedBrandId });
            if (selectedFolder !== null) {
                params.set('folderId', selectedFolder || '');
            }
            if (filterType !== 'all') {
                params.set('type', filterType);
            }
            if (debouncedSearchQuery) {
                params.set('search', debouncedSearchQuery);
            }

            const assetsResponse = await fetch(`/api/social/media?${params.toString()}`);
            if (!assetsResponse.ok) {
                throw new Error('Failed to fetch media');
            }
            const assetsData = await assetsResponse.json();
            setAssets(assetsData.assets || []);
            setStats(assetsData.stats || EMPTY_STATS);
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Failed to load media',
                description: getErrorMessage(error),
            });
        } finally {
            setIsLibraryLoading(false);
        }
    }, [debouncedSearchQuery, filterType, selectedBrandId, selectedFolder, toast]);

    useEffect(() => {
        fetchMedia();
    }, [fetchMedia]);

    useEffect(() => {
        setSelectedAssets((current) => {
            const next = new Set(
                [...current].filter((assetId) => assets.some((asset) => asset._id === assetId)),
            );
            if (next.size === current.size) {
                return current;
            }
            return next;
        });
    }, [assets]);

    useEffect(() => {
        if (selectedTag && !assets.some((asset) => asset.tags.includes(selectedTag))) {
            setSelectedTag(null);
        }
    }, [assets, selectedTag]);

    const folderMap = useMemo(() => new Map(folders.map((folder) => [folder._id, folder])), [folders]);
    const selectedUploadProvider = useMemo(
        () =>
            storageProviders.find((provider) => provider.id === selectedUploadProviderId) || null,
        [selectedUploadProviderId, storageProviders],
    );
    const connectedDriveProvider = useMemo(
        () => storageProviders.find((provider) => provider.provider === 'google-drive') || null,
        [storageProviders],
    );
    const tagSummary = useMemo(() => buildTagSummary(assets), [assets]);
    const visibleAssets = useMemo(() => {
        const tagFilteredAssets = selectedTag
            ? assets.filter((asset) => asset.tags.includes(selectedTag))
            : assets;
        return sortMediaAssets(tagFilteredAssets, sortBy);
    }, [assets, selectedTag, sortBy]);
    const selectedSummary = useMemo(
        () => calculateSelectionSummary(assets, selectedAssets),
        [assets, selectedAssets],
    );
    const recentUploads = useMemo(() => countRecentAssets(assets, { days: 7 }), [assets]);
    const organizedAssetCount = useMemo(
        () => assets.filter((asset) => !!asset.folderId).length,
        [assets],
    );

    const organizationProgress = stats.totalAssets
        ? Math.round((organizedAssetCount / stats.totalAssets) * 100)
        : 0;
    const videoMix = stats.totalAssets
        ? Math.round((stats.videoCount / stats.totalAssets) * 100)
        : 0;
    const allVisibleSelected =
        visibleAssets.length > 0 && visibleAssets.every((asset) => selectedAssets.has(asset._id));

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getErrorMessage = (error: unknown) =>
        error instanceof Error ? error.message : 'Unexpected error';

    const readImageMetadata = (file: File) =>
        new Promise<Pick<UploadCandidate, 'width' | 'height'>>((resolve, reject) => {
            const objectUrl = URL.createObjectURL(file);
            const image = new window.Image();

            image.onload = () => {
                resolve({ width: image.naturalWidth, height: image.naturalHeight });
                URL.revokeObjectURL(objectUrl);
            };
            image.onerror = () => {
                reject(new Error(`Failed to read image metadata for ${file.name}`));
                URL.revokeObjectURL(objectUrl);
            };
            image.src = objectUrl;
        });

    const readVideoMetadata = (file: File) =>
        new Promise<Pick<UploadCandidate, 'width' | 'height' | 'duration'>>((resolve, reject) => {
            const objectUrl = URL.createObjectURL(file);
            const video = document.createElement('video');

            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                resolve({
                    width: video.videoWidth,
                    height: video.videoHeight,
                    duration: Number.isFinite(video.duration) ? Math.round(video.duration) : undefined,
                });
                URL.revokeObjectURL(objectUrl);
            };
            video.onerror = () => {
                reject(new Error(`Failed to read video metadata for ${file.name}`));
                URL.revokeObjectURL(objectUrl);
            };
            video.src = objectUrl;
        });

    const buildUploadCandidate = async (file: File): Promise<UploadCandidate> => {
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        const metadata = type === 'video' ? await readVideoMetadata(file) : await readImageMetadata(file);

        return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            previewUrl: URL.createObjectURL(file),
            type,
            ...metadata,
        };
    };

    const openCreateFolderDialog = useCallback(() => {
        setFolderForm({ mode: 'create', name: '', color: '#4f46e5' });
        setFolderDialogOpen(true);
    }, []);

    const openEditFolderDialog = (folder: MediaFolder) => {
        setFolderForm({
            mode: 'edit',
            folderId: folder._id,
            name: folder.name,
            color: folder.color || '#4f46e5',
        });
        setFolderDialogOpen(true);
    };

    const handleSaveFolder = async () => {
        if (!selectedBrandId || !folderForm.name.trim()) {
            return;
        }

        setIsSavingFolder(true);
        try {
            const isEditing = folderForm.mode === 'edit' && folderForm.folderId;
            const response = await fetch('/api/social/media/folders', {
                method: isEditing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                    isEditing
                        ? {
                            folderId: folderForm.folderId,
                            name: folderForm.name.trim(),
                            color: folderForm.color,
                        }
                        : {
                            brandId: selectedBrandId,
                            name: folderForm.name.trim(),
                            color: folderForm.color,
                        },
                ),
            });

            if (!response.ok) {
                throw new Error(isEditing ? 'Failed to update folder' : 'Failed to create folder');
            }

            toast({ title: isEditing ? 'Folder updated' : 'Folder created' });
            setFolderDialogOpen(false);
            await fetchMedia();
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: folderForm.mode === 'edit' ? 'Failed to update folder' : 'Failed to create folder',
                description: getErrorMessage(error),
            });
        } finally {
            setIsSavingFolder(false);
        }
    };

    const handleDeleteFolder = async (folderId: string) => {
        try {
            const response = await fetch(`/api/social/media/folders?id=${folderId}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error('Failed to delete folder');
            }

            if (selectedFolder === folderId) {
                setSelectedFolder(null);
            }

            toast({ title: 'Folder deleted' });
            await fetchMedia();
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Failed to delete folder',
                description: getErrorMessage(error),
            });
        }
    };

    const handleDeleteAsset = async (assetId: string) => {
        try {
            const response = await fetch(`/api/social/media?id=${assetId}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error('Failed to delete media');
            }

            setSelectedAssets((current) => {
                const next = new Set(current);
                next.delete(assetId);
                return next;
            });
            setSelectedAsset((current) => (current?._id === assetId ? null : current));
            toast({ title: 'Media deleted' });
            await fetchMedia();
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Failed to delete media',
                description: getErrorMessage(error),
            });
        }
    };

    const handleBulkDelete = async () => {
        const assetIds = [...selectedAssets];
        if (assetIds.length === 0) {
            return;
        }

        setIsBulkDeleting(true);
        try {
            const response = await fetch(`/api/social/media?ids=${assetIds.join(',')}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error('Failed to delete selected media');
            }

            setSelectedAssets(new Set());
            toast({
                title: 'Selection deleted',
                description: `${assetIds.length} asset${assetIds.length === 1 ? '' : 's'} removed.`,
            });
            await fetchMedia();
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Failed to delete selection',
                description: getErrorMessage(error),
            });
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const handleSaveAssetDetails = async () => {
        if (!selectedAsset) {
            return;
        }

        setIsSavingAsset(true);
        try {
            const response = await fetch('/api/social/media', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetId: selectedAsset._id,
                    folderId: assetFolderValue === ROOT_FOLDER_VALUE ? null : assetFolderValue,
                    tags: parseMediaTags(assetTagsInput),
                    altText: assetAltText.trim(),
                }),
            });
            if (!response.ok) {
                throw new Error('Failed to update media');
            }

            toast({ title: 'Media updated' });
            setSelectedAsset(null);
            await fetchMedia();
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Failed to update media',
                description: getErrorMessage(error),
            });
        } finally {
            setIsSavingAsset(false);
        }
    };

    const handleCopyAssetUrl = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            toast({ title: 'Asset URL copied' });
        } catch {
            toast({ variant: 'destructive', title: 'Failed to copy URL' });
        }
    };

    const handleUploadFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
        const fileList = event.target.files;
        if (!fileList || fileList.length === 0) {
            return;
        }

        try {
            const nextCandidates = await Promise.all(
                Array.from(fileList)
                    .filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'))
                    .map((file) => buildUploadCandidate(file)),
            );

            setUploadCandidates((current) => [...current, ...nextCandidates]);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Failed to stage upload',
                description: getErrorMessage(error),
            });
        } finally {
            event.target.value = '';
        }
    };

    const handleRemoveUploadCandidate = (candidateId: string) => {
        setUploadCandidates((current) => {
            const next = current.filter((candidate) => candidate.id !== candidateId);
            const removed = current.find((candidate) => candidate.id === candidateId);
            if (removed) {
                URL.revokeObjectURL(removed.previewUrl);
            }
            return next;
        });
    };

    const handleUploadAssets = async () => {
        if (!selectedBrandId || uploadCandidates.length === 0) {
            return;
        }

        setIsUploadingAssets(true);
        setUploadProgress({
            completed: 0,
            total: uploadCandidates.length,
            currentFileName: uploadCandidates[0]?.file.name || '',
        });

        try {
            const tags = parseMediaTags(uploadTagsInput);
            const folderId = uploadFolderValue === ROOT_FOLDER_VALUE ? null : uploadFolderValue;
            const storageFolder = getBrandMediaStorageFolder({
                brandId: selectedBrandId,
                brandHandle: brands.find((brand) => brand._id === selectedBrandId)?.handle,
            });

            for (let index = 0; index < uploadCandidates.length; index += 1) {
                const candidate = uploadCandidates[index];
                setUploadProgress({
                    completed: index,
                    total: uploadCandidates.length,
                    currentFileName: candidate.file.name,
                });

                const formData = new FormData();
                formData.append('file', candidate.file);
                formData.append('folder', storageFolder);
                if (selectedUploadProvider && !selectedUploadProvider.isDefault) {
                    formData.append('provider', selectedUploadProvider.provider);
                    formData.append('storageId', selectedUploadProvider.id);
                }

                const uploadResponse = await fetch(
                    selectedUploadProvider && !selectedUploadProvider.isDefault
                        ? '/api/storage/upload'
                        : '/api/social/upload',
                    {
                    method: 'POST',
                    body: formData,
                    },
                );
                const uploadData = await uploadResponse.json();

                if (!uploadResponse.ok || !uploadData.url) {
                    throw new Error(uploadData.error || `Failed to upload ${candidate.file.name}`);
                }

                const assetPayload = buildCreateMediaAssetPayload({
                    brandId: selectedBrandId,
                    file: candidate.file,
                    uploadedUrl: uploadData.url,
                    folderId,
                    tags,
                    altText: uploadCandidates.length === 1 ? uploadAltText.trim() : '',
                    dimensions: {
                        width: candidate.width,
                        height: candidate.height,
                    },
                    duration: candidate.duration,
                });

                const createAssetResponse = await fetch('/api/social/media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(assetPayload),
                });
                const createAssetData = await createAssetResponse.json();

                if (!createAssetResponse.ok) {
                    throw new Error(createAssetData.error || `Failed to save ${candidate.file.name}`);
                }
            }

            setUploadProgress({
                completed: uploadCandidates.length,
                total: uploadCandidates.length,
                currentFileName: '',
            });
            toast({
                title: 'Upload complete',
                description: `${uploadCandidates.length} asset${uploadCandidates.length === 1 ? '' : 's'} added to the library.`,
            });
            setUploadDialogOpen(false);
            await fetchMedia();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Upload failed',
                description: getErrorMessage(error),
            });
        } finally {
            setIsUploadingAssets(false);
        }
    };

    useEffect(() => {
        if (!generateDialogOpen) {
            setGeneratePrompt('');
            setGenerateAspectRatio('1:1');
        }
    }, [generateDialogOpen]);

    const handleGenerateImage = async () => {
        if (!selectedBrandId || !generatePrompt.trim()) {
            return;
        }

        const response = await fetch('/api/social/media/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                brandId: selectedBrandId,
                prompt: generatePrompt.trim(),
                aspectRatio: generateAspectRatio,
            }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            // Plan-limit / feature-disabled responses carry their own message.
            const message =
                response.status === 402
                    ? data.error || 'Your plan does not include AI image generation. Upgrade to continue.'
                    : data.error || 'Failed to generate image';
            toast({ variant: 'destructive', title: 'Image generation failed', description: message });
            throw new Error(message);
        }

        toast({
            title: 'Image generated',
            description: 'The new asset has been added to your library.',
        });
        await fetchMedia();
    };

    const fetchDriveFiles = useCallback(async () => {
        if (!selectedBrandId || !connectedDriveProvider) {
            setDriveFiles([]);
            return;
        }

        setIsDriveFilesLoading(true);
        try {
            const brand = brands.find((item) => item._id === selectedBrandId);
            const params = new URLSearchParams({
                brandId: selectedBrandId,
                storageId: connectedDriveProvider.id,
            });
            if (brand?.handle) {
                params.set('brandHandle', brand.handle);
            }

            const response = await fetch(`/api/storage/files?${params.toString()}`);
            if (!response.ok) {
                throw new Error('Failed to load Drive files');
            }

            const data = await response.json();
            setDriveFiles(filterImportableStorageFiles(data.files || []));
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Failed to load Drive files',
                description: getErrorMessage(error),
            });
        } finally {
            setIsDriveFilesLoading(false);
        }
    }, [brands, connectedDriveProvider, selectedBrandId, toast]);

    const handleImportDriveFiles = async () => {
        if (!selectedBrandId || selectedDriveKeys.size === 0) {
            return;
        }

        setIsImportingDriveFiles(true);
        try {
            const selectedFiles = driveFiles.filter((file) => selectedDriveKeys.has(file.key));
            const tags = parseMediaTags(uploadTagsInput);
            const folderId = uploadFolderValue === ROOT_FOLDER_VALUE ? null : uploadFolderValue;

            for (const file of selectedFiles) {
                const payload = buildCreateMediaAssetPayload({
                    brandId: selectedBrandId,
                    file: {
                        name: file.name,
                        type: file.contentType,
                        size: file.size,
                    },
                    uploadedUrl: file.url,
                    folderId,
                    tags,
                    altText: '',
                });

                const response = await fetch('/api/social/media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || `Failed to import ${file.name}`);
                }
            }

            toast({
                title: 'Drive import complete',
                description: `${selectedFiles.length} asset${selectedFiles.length === 1 ? '' : 's'} added to the library.`,
            });
            setSelectedDriveKeys(new Set());
            setDriveImportDialogOpen(false);
            await fetchMedia();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Drive import failed',
                description: getErrorMessage(error),
            });
        } finally {
            setIsImportingDriveFiles(false);
        }
    };

    useEffect(() => {
        if (!driveImportDialogOpen) {
            setSelectedDriveKeys(new Set());
            return;
        }

        fetchDriveFiles();
    }, [driveImportDialogOpen, fetchDriveFiles]);

    const toggleSelectedAsset = (assetId: string, checked: boolean) => {
        setSelectedAssets((current) => {
            const next = new Set(current);
            if (checked) {
                next.add(assetId);
            } else {
                next.delete(assetId);
            }
            return next;
        });
    };

    const toggleSelectAllVisible = (checked: boolean) => {
        setSelectedAssets((current) => {
            const next = new Set(current);
            for (const asset of visibleAssets) {
                if (checked) {
                    next.add(asset._id);
                } else {
                    next.delete(asset._id);
                }
            }
            return next;
        });
    };

    if (isBrandsLoading) {
        return (
            <div className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={`skeleton-${index}`} className="h-32 rounded-2xl" />
                    ))}
                </div>
                <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <Skeleton className="h-[620px] rounded-2xl" />
                    <Skeleton className="h-[620px] rounded-2xl" />
                </div>
            </div>
        );
    }

    if (brands.length === 0) {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <EmptyState
                    icon={ImageIcon}
                    title="No brands found"
                    note="Create a brand connection first so the media library has somewhere to organize assets."
                    cta={
                        <Button variant="primary" size="sm" asChild>
                            <Link href="/settings/connections">Open connections</Link>
                        </Button>
                    }
                    className="max-w-md"
                />
            </div>
        );
    }

    const primaryAction = (
        <div className="flex items-center gap-2">
            <Button
                variant="outline"
                size="sm"
                icon={Sparkles}
                onClick={() => setGenerateDialogOpen(true)}
                disabled={!selectedBrandId}
            >
                Generate with AI
            </Button>
            <Button variant="brand" size="sm" icon={Upload} onClick={() => setUploadDialogOpen(true)}>
                Upload media
            </Button>
        </div>
    );

    const secondaryActions = (
        <>
            {brands.length > 1 && selectedBrandId ? (
                <KitSelect
                    value={selectedBrandId}
                    onChange={(value) => {
                        setSelectedBrandId(value);
                        setSelectedAssets(new Set());
                        setSelectedFolder(null);
                        setSelectedTag(null);
                    }}
                    placeholder="Select brand"
                    triggerClassName="w-[180px]"
                    options={brands.map((brand) => ({ value: brand._id, label: brand.name }))}
                />
            ) : null}
            <Button
                variant="outline"
                size="sm"
                icon={RefreshCw}
                onClick={() => fetchMedia()}
                disabled={isLibraryLoading}
            />
            <Button variant="outline" size="sm" icon={FolderPlus} onClick={openCreateFolderDialog}>
                New folder
            </Button>
        </>
    );

    const filterBar = (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_160px_160px]">
            <KitInput
                icon={Search}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search filenames, tags, or campaign assets"
            />
            <KitSelect
                value={filterType}
                onChange={(value) => setFilterType(value as 'all' | 'image' | 'video')}
                options={[
                    { value: 'all', label: 'All types' },
                    { value: 'image', label: 'Images' },
                    { value: 'video', label: 'Videos' },
                ]}
            />
            <KitSelect
                value={sortBy}
                onChange={(value) => setSortBy(value as MediaAssetSort)}
                options={[
                    { value: 'newest', label: 'Newest first' },
                    { value: 'oldest', label: 'Oldest first' },
                    { value: 'largest', label: 'Largest first' },
                    { value: 'smallest', label: 'Smallest first' },
                    { value: 'most-used', label: 'Most used' },
                    { value: 'name', label: 'Name A-Z' },
                ]}
            />
        </div>
    );

    return (
        <ModuleShell
            title="Media library"
            icon={FileImage}
            meta={selectedBrandId
                ? `${brands.find((brand) => brand._id === selectedBrandId)?.name || 'Brand'} · ${stats.totalAssets} assets`
                : `${stats.totalAssets} assets`}
            primaryAction={primaryAction}
            secondaryActions={secondaryActions}
            filterBar={filterBar}
            contentClassName="flex flex-col gap-3 pb-8"
        >
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <Card icon={HardDrive} title="Library size">
                            <div className="p-4 pt-0">
                                <p className="text-2xl font-semibold tracking-tight">{formatFileSize(stats.totalSize)}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {stats.totalAssets} asset{stats.totalAssets === 1 ? '' : 's'} available across the selected brand.
                                </p>
                            </div>
                        </Card>

                        <Card icon={Upload} title="Fresh uploads">
                            <div className="p-4 pt-0">
                                <p className="text-2xl font-semibold tracking-tight">{recentUploads}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Added in the last 7 days so new campaign assets surface quickly.
                                </p>
                            </div>
                        </Card>

                        <Card icon={Folder} title="Folder coverage">
                            <div className="p-4 pt-0 space-y-3">
                                <p className="text-2xl font-semibold tracking-tight">{organizationProgress}%</p>
                                <Progress value={organizationProgress} className="h-2" />
                                <p className="text-sm text-muted-foreground">
                                    {organizedAssetCount} of {stats.totalAssets} assets already filed into folders.
                                </p>
                            </div>
                        </Card>

                        <Card icon={Film} title="Media mix">
                            <div className="p-4 pt-0 space-y-3">
                                <p className="text-2xl font-semibold tracking-tight">{videoMix}% video</p>
                                <Progress value={videoMix} className="h-2" />
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                        <FileImage className="size-4" />
                                        {stats.imageCount} images
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <Video className="size-4" />
                                        {stats.videoCount} videos
                                    </span>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
                        <div className="space-y-6">
                            <Card title="Folders" meta="Jump between organized sets or keep unfiled media visible from the root.">
                                <div className="px-0 pb-3">
                                    <ScrollArea className="h-[320px] px-3">
                                        <div className="space-y-1">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedFolder(null)}
                                                className={cn(
                                                    'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted',
                                                    selectedFolder === null && 'bg-muted',
                                                )}
                                            >
                                                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                                    <ImageIcon className="size-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium">All media</p>
                                                    <p className="text-xs text-muted-foreground">Everything in the brand library</p>
                                                </div>
                                                <KitChip tone="gray">{stats.totalAssets}</KitChip>
                                            </button>

                                            {folders.map((folder) => (
                                                <button
                                                    key={folder._id}
                                                    type="button"
                                                    onClick={() => setSelectedFolder(folder._id)}
                                                    className={cn(
                                                        'group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted',
                                                        selectedFolder === folder._id && 'bg-muted',
                                                    )}
                                                >
                                                    <div
                                                        className="rounded-lg p-2"
                                                        style={{ backgroundColor: `${folder.color || '#4f46e5'}20`, color: folder.color || '#4f46e5' }}
                                                    >
                                                        <Folder className="size-4" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">{folder.name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {folder.assetCount} asset{folder.assetCount === 1 ? '' : 's'}
                                                        </p>
                                                    </div>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                icon={MoreVertical}
                                                                className="size-8 !px-0 opacity-0 transition-opacity group-hover:opacity-100"
                                                            />
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                onClick={(event) => {
                                                                    event.preventDefault();
                                                                    openEditFolderDialog(folder);
                                                                }}
                                                            >
                                                                <Edit className="mr-2 size-4" />
                                                                Edit folder
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive"
                                                                onClick={(event) => {
                                                                    event.preventDefault();
                                                                    handleDeleteFolder(folder._id);
                                                                }}
                                                            >
                                                                <Trash2 className="mr-2 size-4" />
                                                                Delete folder
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </button>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>
                            </Card>

                            <Card title="Top tags" meta="Quick client-side filters based on the tags already saved on your assets.">
                                <div className="p-5 pt-0 space-y-3">
                                    {tagSummary.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {tagSummary.slice(0, 10).map((tagItem) => (
                                                <button
                                                    key={tagItem.tag}
                                                    type="button"
                                                    onClick={() => setSelectedTag((current) => (current === tagItem.tag ? null : tagItem.tag))}
                                                    className={cn(
                                                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                                                        selectedTag === tagItem.tag
                                                            ? 'border-brand bg-brand/10 text-brand'
                                                            : 'border-border bg-background hover:bg-muted',
                                                    )}
                                                >
                                                    <Tag className="size-3.5" />
                                                    <span>{tagItem.tag}</span>
                                                    <KitChip tone="gray" className="h-auto px-1.5 text-[10px]">
                                                        {tagItem.count}
                                                    </KitChip>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            Add tags to assets from the detail view and they will appear here as reusable filters.
                                        </p>
                                    )}
                                </div>
                            </Card>
                        </div>

                        <Card
                            title="Asset browser"
                            meta="Search, sort, and batch-clean your library without leaving the page."
                            action={
                                <div className="flex items-center gap-3">
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href="/social/create-post">Create post</Link>
                                    </Button>
                                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                                        <Button
                                            variant={viewMode === 'grid' ? 'outline' : 'ghost'}
                                            size="sm"
                                            icon={Grid}
                                            onClick={() => setViewMode('grid')}
                                        />
                                        <Button
                                            variant={viewMode === 'list' ? 'outline' : 'ghost'}
                                            size="sm"
                                            icon={List}
                                            onClick={() => setViewMode('list')}
                                        />
                                    </div>
                                </div>
                            }
                        >
                            <div className="p-5 pt-0 space-y-4">
                                <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/40 p-4 xl:flex-row xl:items-center xl:justify-between">
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                            <KitChip tone="gray">{visibleAssets.length} visible</KitChip>
                                            {selectedTag && (
                                                <KitChip tone="brand">
                                                    Tag: {selectedTag}
                                                    <button type="button" onClick={() => setSelectedTag(null)}>
                                                        <X className="size-3" />
                                                    </button>
                                                </KitChip>
                                            )}
                                            {selectedSummary.count > 0 && (
                                                <KitChip tone="info">
                                                    {selectedSummary.count} selected, {formatFileSize(selectedSummary.totalSize)}
                                                </KitChip>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Select multiple assets for cleanup, or open an asset to edit folder, tags, and alt text.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => toggleSelectAllVisible(!allVisibleSelected)}
                                            disabled={visibleAssets.length === 0}
                                        >
                                            {allVisibleSelected ? 'Clear visible' : 'Select visible'}
                                        </Button>

                                        {selectedSummary.count > 0 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                icon={isBulkDeleting ? Loader2 : Trash2}
                                                onClick={handleBulkDelete}
                                                disabled={isBulkDeleting}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                {isBulkDeleting ? 'Deleting…' : 'Delete selected'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="px-5 pb-5">
                                {isLibraryLoading ? (
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                        {Array.from({ length: 8 }).map((_, index) => (
                                            <Skeleton key={`skeleton-${index}`} className="aspect-[4/4.8] rounded-2xl" />
                                        ))}
                                    </div>
                                ) : visibleAssets.length === 0 ? (
                                    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-10 text-center">
                                        <div className="mb-4 rounded-full bg-muted p-4">
                                            <ImageIcon className="size-8 text-muted-foreground" />
                                        </div>
                                        <h3 className="text-lg font-semibold">No assets match this view</h3>
                                        <p className="mt-2 max-w-md text-sm text-muted-foreground">
                                            Try a different folder, clear the active tag filter, or widen your search query.
                                        </p>
                                        {(searchQuery || selectedTag || filterType !== 'all' || selectedFolder !== null) && (
                                            <div className="mt-4 flex flex-wrap justify-center gap-2">
                                                <Button variant="outline" onClick={() => setSearchQuery('')}>
                                                    Clear search
                                                </Button>
                                                <Button variant="outline" onClick={() => setSelectedTag(null)}>
                                                    Clear tag
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => {
                                                        setFilterType('all');
                                                        setSelectedFolder(null);
                                                    }}
                                                >
                                                    Reset filters
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ) : viewMode === 'grid' ? (
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                        {visibleAssets.map((asset) => {
                                            const folder = asset.folderId ? folderMap.get(asset.folderId) : null;
                                            const isSelected = selectedAssets.has(asset._id);

                                            return (
                                                <Card
                                                    key={asset._id}
                                                    className={cn(
                                                        'group overflow-hidden border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-md',
                                                        isSelected && 'ring-2 ring-brand/40',
                                                    )}
                                                >
                                                    <button
                                                        type="button"
                                                        className="relative aspect-[4/3] cursor-pointer overflow-hidden bg-muted"
                                                        onClick={() => setSelectedAsset(asset)}
                                                    >
                                                        {asset.type === 'image' ? (
                                                            <NextImage
                                                                fill
                                                                src={asset.thumbnailUrl || asset.url}
                                                                alt={asset.altText || asset.originalName}
                                                                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                                                unoptimized
                                                            />
                                                        ) : (
                                                            <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                                                                <Video className="size-10 text-muted-foreground" />
                                                            </div>
                                                        )}

                                                        <div className="absolute left-3 top-3 rounded-md bg-background/90 p-1 shadow-sm">
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onCheckedChange={(checked) => toggleSelectedAsset(asset._id, checked === true)}
                                                                onClick={(event) => event.stopPropagation()}
                                                            />
                                                        </div>

                                                        <div className="absolute bottom-3 right-3 flex gap-2">
                                                            <KitChip tone="gray" className="bg-background/90 backdrop-blur">
                                                                {asset.type === 'image' ? 'Image' : 'Video'}
                                                            </KitChip>
                                                            {asset.usageCount > 0 && (
                                                                <KitChip tone="gray" className="bg-background/90 backdrop-blur">
                                                                    {asset.usageCount} uses
                                                                </KitChip>
                                                            )}
                                                        </div>
                                                    </button>

                                                    <div className="space-y-3 p-4">
                                                        <div className="space-y-1">
                                                            <p
                                                                className="cursor-pointer truncate text-sm font-medium"
                                                                onClick={() => setSelectedAsset(asset)}
                                                            >
                                                                {asset.originalName}
                                                            </p>
                                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                                <span>{formatFileSize(asset.size)}</span>
                                                                <span>{formatDistanceToNow(new Date(asset.createdAt), { addSuffix: true })}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap gap-2">
                                                            <KitChip tone="gray">
                                                                {folder ? folder.name : 'Root'}
                                                            </KitChip>
                                                            {asset.tags.slice(0, 2).map((tag) => (
                                                                <KitChip key={tag} tone="gray">
                                                                    {tag}
                                                                </KitChip>
                                                            ))}
                                                            {asset.tags.length > 2 && (
                                                                <KitChip tone="gray">
                                                                    +{asset.tags.length - 2}
                                                                </KitChip>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center justify-between">
                                                            <Button variant="ghost" size="sm" onClick={() => setSelectedAsset(asset)}>
                                                                Edit details
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                icon={Trash2}
                                                                className="text-muted-foreground hover:text-destructive"
                                                                onClick={() => handleDeleteAsset(asset._id)}
                                                            />
                                                        </div>
                                                    </div>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {visibleAssets.map((asset) => {
                                            const folder = asset.folderId ? folderMap.get(asset.folderId) : null;
                                            const isSelected = selectedAssets.has(asset._id);

                                            return (
                                                <Card
                                                    key={asset._id}
                                                    className={cn(
                                                        'border-border/60 transition-colors hover:bg-muted/30',
                                                        isSelected && 'ring-2 ring-brand/40',
                                                    )}
                                                >
                                                    <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                                                        <div className="flex items-start gap-4">
                                                            <div className="rounded-md bg-background/90 p-1 shadow-sm">
                                                                <Checkbox
                                                                    checked={isSelected}
                                                                    onCheckedChange={(checked) => toggleSelectedAsset(asset._id, checked === true)}
                                                                />
                                                            </div>

                                                            <button
                                                                type="button"
                                                                className="flex size-16 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-muted"
                                                                onClick={() => setSelectedAsset(asset)}
                                                            >
                                                                {asset.type === 'image' ? (
                                                                    <NextImage
                                                                        fill
                                                                        src={asset.thumbnailUrl || asset.url}
                                                                        alt={asset.altText || asset.originalName}
                                                                        className="object-cover"
                                                                        unoptimized
                                                                    />
                                                                ) : (
                                                                    <Video className="size-6 text-muted-foreground" />
                                                                )}
                                                            </button>
                                                        </div>

                                                        <div className="min-w-0 flex-1 space-y-2">
                                                            <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                                                                <button
                                                                    type="button"
                                                                    className="truncate text-left text-sm font-medium"
                                                                    onClick={() => setSelectedAsset(asset)}
                                                                >
                                                                    {asset.originalName}
                                                                </button>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {formatDistanceToNow(new Date(asset.createdAt), { addSuffix: true })}
                                                                </p>
                                                            </div>

                                                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                                <KitChip tone="gray">{asset.type === 'image' ? 'Image' : 'Video'}</KitChip>
                                                                <KitChip tone="gray">{formatFileSize(asset.size)}</KitChip>
                                                                <KitChip tone="gray">{folder ? folder.name : 'Root'}</KitChip>
                                                                <KitChip tone="gray">{asset.usageCount} uses</KitChip>
                                                            </div>

                                                            {asset.tags.length > 0 && (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {asset.tags.map((tag) => (
                                                                        <KitChip key={tag} tone="gray">
                                                                            {tag}
                                                                        </KitChip>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <Button variant="ghost" size="sm" onClick={() => setSelectedAsset(asset)}>
                                                                Edit
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                icon={Trash2}
                                                                className="text-muted-foreground hover:text-destructive"
                                                                onClick={() => handleDeleteAsset(asset._id)}
                                                            />
                                                        </div>
                                                    </div>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                </div>

            <FormDialog
                open={generateDialogOpen}
                onOpenChange={setGenerateDialogOpen}
                title="Generate image with AI"
                description="Describe the image you want. It will be added to this brand's media library."
                icon={Sparkles}
                submitLabel="Generate"
                submitDisabled={!generatePrompt.trim()}
                onSubmit={handleGenerateImage}
            >
                <KitField
                    label="Prompt"
                    htmlFor="ai-generate-prompt"
                    hint="Be specific about subject, style, lighting, and mood."
                    required
                >
                    <KitTextarea
                        id="ai-generate-prompt"
                        value={generatePrompt}
                        onChange={(event) => setGeneratePrompt(event.target.value)}
                        placeholder="A minimalist product hero shot of a ceramic coffee mug on a sunlit wooden table, soft shadows"
                        rows={5}
                    />
                </KitField>
                <KitField label="Aspect ratio" htmlFor="ai-generate-aspect">
                    <KitSelect
                        aria-label="Aspect ratio"
                        value={generateAspectRatio}
                        onChange={(value) => setGenerateAspectRatio(value as AiAspectRatio)}
                        options={AI_ASPECT_RATIOS.map((ratio) => ({ value: ratio.value, label: ratio.label }))}
                    />
                </KitField>
            </FormDialog>

            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Upload media</DialogTitle>
                        <DialogDescription>
                            Add images or videos directly to the brand library, then place them into a folder with shared tags.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-6 lg:grid-cols-[1.2fr_minmax(0,0.8fr)]">
                        <div className="space-y-4">
                            <label className="block">
                                <div className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5">
                                    <Upload className="mb-3 size-8 text-muted-foreground" />
                                    <p className="text-sm font-medium">Choose files to upload</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Supports images and videos. You can add more files before starting the upload.
                                    </p>
                                </div>
                                <Input
                                    type="file"
                                    accept="image/*,video/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleUploadFileSelection}
                                />
                            </label>

                            <div className="rounded-2xl border">
                                <ScrollArea className="h-[300px]">
                                    <div className="space-y-3 p-4">
                                        {uploadCandidates.length > 0 ? (
                                            uploadCandidates.map((candidate) => (
                                                <div
                                                    key={candidate.id}
                                                    className="flex items-center gap-3 rounded-xl border bg-background p-3"
                                                >
                                                    <div className="flex size-14 items-center justify-center overflow-hidden rounded-xl bg-muted">
                                                        {candidate.type === 'image' ? (
                                                            <NextImage
                                                                src={candidate.previewUrl}
                                                                alt={candidate.file.name}
                                                                width={56}
                                                                height={56}
                                                                className="h-full w-full object-cover"
                                                                unoptimized
                                                            />
                                                        ) : (
                                                            <Video className="size-5 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">{candidate.file.name}</p>
                                                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                            <span>{candidate.type === 'image' ? 'Image' : 'Video'}</span>
                                                            <span>{formatFileSize(candidate.file.size)}</span>
                                                            {candidate.width && candidate.height && (
                                                                <span>
                                                                    {candidate.width} x {candidate.height}
                                                                </span>
                                                            )}
                                                            {candidate.duration ? <span>{candidate.duration}s</span> : null}
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        icon={X}
                                                        className="size-8 !px-0"
                                                        onClick={() => handleRemoveUploadCandidate(candidate.id)}
                                                        disabled={isUploadingAssets}
                                                    />
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex min-h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
                                                Select one or more files to stage the upload.
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="upload-storage">Upload destination</Label>
                                <Select value={selectedUploadProviderId} onValueChange={setSelectedUploadProviderId}>
                                    <SelectTrigger id="upload-storage">
                                        <SelectValue placeholder="Select storage" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {storageProviders.map((provider) => (
                                            <SelectItem key={provider.id} value={provider.id}>
                                                {provider.name}
                                                {provider.provider === 'google-drive' && provider.email ? ` (${provider.email})` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedUploadProvider?.provider === 'google-drive' && (
                                    <p className="text-xs text-muted-foreground">
                                        New uploads will be stored in the connected Google Drive brand folder and added to the media library.
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="upload-folder">Folder</Label>
                                <Select value={uploadFolderValue} onValueChange={setUploadFolderValue}>
                                    <SelectTrigger id="upload-folder">
                                        <SelectValue placeholder="Select folder" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ROOT_FOLDER_VALUE}>Root library</SelectItem>
                                        {folders.map((folder) => (
                                            <SelectItem key={folder._id} value={folder._id}>
                                                {folder.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="upload-tags">Tags</Label>
                                <Input
                                    id="upload-tags"
                                    value={uploadTagsInput}
                                    onChange={(event) => setUploadTagsInput(event.target.value)}
                                    placeholder="launch, paid-social, evergreen"
                                />
                                {parseMediaTags(uploadTagsInput).length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {parseMediaTags(uploadTagsInput).map((tag) => (
                                            <KitChip key={tag} tone="gray">
                                                {tag}
                                            </KitChip>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="upload-alt-text">Alt text</Label>
                                <Textarea
                                    id="upload-alt-text"
                                    value={uploadAltText}
                                    onChange={(event) => setUploadAltText(event.target.value)}
                                    placeholder="Optional description for a single image upload"
                                    className="min-h-[120px]"
                                    disabled={uploadCandidates.length > 1}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {uploadCandidates.length > 1
                                        ? 'Alt text is only applied when uploading a single asset in this dialog.'
                                        : 'Alt text will be saved on the uploaded asset.'}
                                </p>
                            </div>

                            <div className="rounded-2xl border bg-muted/30 p-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Queued assets</span>
                                    <span className="font-medium">{uploadCandidates.length}</span>
                                </div>
                                {connectedDriveProvider && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-4 w-full"
                                        onClick={() => setDriveImportDialogOpen(true)}
                                        disabled={isUploadingAssets}
                                    >
                                        Import from Google Drive
                                    </Button>
                                )}
                                {isUploadingAssets && uploadProgress.total > 0 && (
                                    <div className="mt-4 space-y-2">
                                        <Progress
                                            value={(uploadProgress.completed / uploadProgress.total) * 100}
                                            className="h-2"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Uploading {uploadProgress.currentFileName} ({uploadProgress.completed + 1}/{uploadProgress.total})
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setUploadDialogOpen(false)} disabled={isUploadingAssets}>
                            Cancel
                        </Button>
                        <Button onClick={handleUploadAssets} disabled={isUploadingAssets || uploadCandidates.length === 0}>
                            {isUploadingAssets ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Uploading
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 size-4" />
                                    Upload to library
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={driveImportDialogOpen} onOpenChange={setDriveImportDialogOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Import from Google Drive</DialogTitle>
                        <DialogDescription>
                            Select files from the connected brand Drive folder and add them to the media library.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="rounded-2xl border">
                            <ScrollArea className="h-[420px]">
                                <div className="space-y-3 p-4">
                                    {isDriveFilesLoading ? (
                                        Array.from({ length: 6 }).map((_, index) => (
                                            <Skeleton key={`skeleton-${index}`} className="h-20 rounded-xl" />
                                        ))
                                    ) : driveFiles.length > 0 ? (
                                        driveFiles.map((file) => {
                                            const isSelected = selectedDriveKeys.has(file.key);
                                            const isImage = file.contentType.startsWith('image/');

                                            return (
                                                <button
                                                    key={file.key}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedDriveKeys((current) => {
                                                            const next = new Set(current);
                                                            if (next.has(file.key)) {
                                                                next.delete(file.key);
                                                            } else {
                                                                next.add(file.key);
                                                            }
                                                            return next;
                                                        })
                                                    }
                                                    className={cn(
                                                        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/30',
                                                        isSelected && 'border-primary bg-primary/5',
                                                    )}
                                                >
                                                    <div className="rounded-md bg-background/90 p-1 shadow-sm">
                                                        <Checkbox checked={isSelected} />
                                                    </div>
                                                    <div className="flex size-14 items-center justify-center overflow-hidden rounded-xl bg-muted">
                                                        {isImage ? (
                                                            <NextImage
                                                                src={file.url}
                                                                alt={file.name}
                                                                width={56}
                                                                height={56}
                                                                className="h-full w-full object-cover"
                                                                unoptimized
                                                            />
                                                        ) : (
                                                            <Video className="size-5 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">{file.name}</p>
                                                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                            <span>{isImage ? 'Image' : 'Video'}</span>
                                                            <span>{formatFileSize(file.size)}</span>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <div className="flex min-h-[260px] items-center justify-center text-center text-sm text-muted-foreground">
                                            No importable files found in the connected Drive brand folder yet.
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>

                        <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                            <p>
                                Brand folder:
                                {' '}
                                <span className="font-medium text-foreground">
                                    {getBrandMediaStorageFolder({
                                        brandId: selectedBrandId,
                                        brandHandle: brands.find((brand) => brand._id === selectedBrandId)?.handle,
                                    })}
                                </span>
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDriveImportDialogOpen(false)} disabled={isImportingDriveFiles}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleImportDriveFiles}
                            disabled={isImportingDriveFiles || selectedDriveKeys.size === 0}
                        >
                            {isImportingDriveFiles ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Importing
                                </>
                            ) : (
                                `Import ${selectedDriveKeys.size || ''}`.trim()
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{folderForm.mode === 'edit' ? 'Edit folder' : 'Create folder'}</DialogTitle>
                        <DialogDescription>
                            Use folders to keep brand assets grouped by campaign, format, or workflow stage.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="folder-name">Folder name</Label>
                            <Input
                                id="folder-name"
                                value={folderForm.name}
                                onChange={(event) =>
                                    setFolderForm((current) => ({ ...current, name: event.target.value }))
                                }
                                placeholder="Spring launch"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="folder-color">Accent color</Label>
                            <Input
                                id="folder-color"
                                type="color"
                                value={folderForm.color}
                                onChange={(event) =>
                                    setFolderForm((current) => ({ ...current, color: event.target.value }))
                                }
                                className="h-11 w-20 p-1"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveFolder} disabled={isSavingFolder || !folderForm.name.trim()}>
                            {isSavingFolder ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Saving
                                </>
                            ) : folderForm.mode === 'edit' ? (
                                'Save changes'
                            ) : (
                                'Create folder'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={selectedAsset !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedAsset(null);
                    }
                }}
            >
                <DialogContent className="max-w-4xl">
                    {selectedAsset && (
                        <>
                            <DialogHeader>
                                <DialogTitle>{selectedAsset.originalName}</DialogTitle>
                                <DialogDescription>
                                    Update the saved metadata so this asset is easier to find and reuse in future posts.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-6 lg:grid-cols-[1.1fr_minmax(0,1fr)]">
                                <div className="space-y-4">
                                    <div className="overflow-hidden rounded-2xl border bg-muted">
                                        <div className="relative aspect-square">
                                            {selectedAsset.type === 'image' ? (
                                                <NextImage
                                                    fill
                                                    src={selectedAsset.url}
                                                    alt={selectedAsset.altText || selectedAsset.originalName}
                                                    className="object-contain"
                                                    unoptimized
                                                />
                                            ) : (
                                                <video src={selectedAsset.url} controls className="h-full w-full" aria-label={selectedAsset.altText || selectedAsset.originalName} />
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Card>
                                            <div className="space-y-1 p-4 text-sm">
                                                <p className="text-muted-foreground">Type</p>
                                                <p className="font-medium capitalize">{selectedAsset.type}</p>
                                            </div>
                                        </Card>
                                        <Card>
                                            <div className="space-y-1 p-4 text-sm">
                                                <p className="text-muted-foreground">Usage count</p>
                                                <p className="font-medium">{selectedAsset.usageCount} uses</p>
                                            </div>
                                        </Card>
                                        <Card>
                                            <div className="space-y-1 p-4 text-sm">
                                                <p className="text-muted-foreground">Size</p>
                                                <p className="font-medium">{formatFileSize(selectedAsset.size)}</p>
                                            </div>
                                        </Card>
                                        <Card>
                                            <div className="space-y-1 p-4 text-sm">
                                                <p className="text-muted-foreground">Dimensions</p>
                                                <p className="font-medium">
                                                    {selectedAsset.width && selectedAsset.height
                                                        ? `${selectedAsset.width} x ${selectedAsset.height}`
                                                        : 'Unknown'}
                                                </p>
                                            </div>
                                        </Card>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="asset-folder">Folder</Label>
                                        <Select value={assetFolderValue} onValueChange={setAssetFolderValue}>
                                            <SelectTrigger id="asset-folder">
                                                <SelectValue placeholder="Select folder" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={ROOT_FOLDER_VALUE}>Root library</SelectItem>
                                                {folders.map((folder) => (
                                                    <SelectItem key={folder._id} value={folder._id}>
                                                        {folder.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="asset-tags">Tags</Label>
                                        <Input
                                            id="asset-tags"
                                            value={assetTagsInput}
                                            onChange={(event) => setAssetTagsInput(event.target.value)}
                                            placeholder="launch, hero, evergreen"
                                        />
                                        {parseMediaTags(assetTagsInput).length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {parseMediaTags(assetTagsInput).map((tag) => (
                                                    <KitChip key={tag} tone="gray">
                                                        {tag}
                                                    </KitChip>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="asset-alt-text">Alt text</Label>
                                        <Textarea
                                            id="asset-alt-text"
                                            value={assetAltText}
                                            onChange={(event) => setAssetAltText(event.target.value)}
                                            placeholder="Describe what appears in the image for accessibility and search."
                                            className="min-h-[120px]"
                                        />
                                    </div>

                                    <div className="rounded-2xl border bg-muted/30 p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium">Quick actions</p>
                                                <p className="text-sm text-muted-foreground">
                                                    Copy the asset URL or remove the asset without leaving the editor.
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                icon={Copy}
                                                onClick={() => handleCopyAssetUrl(selectedAsset.url)}
                                            >
                                                Copy URL
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <DialogFooter className="gap-2 sm:justify-between">
                                <Button
                                    variant="outline"
                                    icon={Trash2}
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteAsset(selectedAsset._id)}
                                >
                                    Delete asset
                                </Button>

                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => setSelectedAsset(null)}>
                                        Cancel
                                    </Button>
                                    <Button variant="brand" icon={isSavingAsset ? Loader2 : Check} onClick={handleSaveAssetDetails} disabled={isSavingAsset}>
                                        {isSavingAsset ? 'Saving…' : 'Save details'}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </ModuleShell>
    );
}
