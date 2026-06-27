'use client';

/**
 * Brand media-library picker for ad creatives. Lists the brand's image
 * assets (uploads, AI-Studio outputs via the asset bridge, and previously
 * generated ad creatives — tag 'ad-creative') and returns the selected URL.
 */

import { useCallback, useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Chip, EmptyState, SearchInput, Spinner } from '@/components/ui-kit';

interface PickerAsset {
    _id: string;
    url: string;
    thumbnailUrl?: string;
    originalName: string;
    tags?: string[];
}

interface AdImagePickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    brandId: string | null | undefined;
    onSelect: (url: string) => void;
}

export function AdImagePickerDialog({ open, onOpenChange, brandId, onSelect }: AdImagePickerDialogProps) {
    const [assets, setAssets] = useState<PickerAsset[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (query: string) => {
        if (!brandId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ brandId, type: 'image', limit: '60' });
            if (query.trim()) params.set('search', query.trim());
            const response = await fetch(`/api/social/media?${params}`);
            if (response.ok) {
                const data = await response.json();
                setAssets(data.assets || []);
            }
        } finally {
            setLoading(false);
        }
    }, [brandId]);

    useEffect(() => {
        if (open) load(search);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handle = window.setTimeout(() => load(search), 350);
        return () => window.clearTimeout(handle);
    }, [search, open, load]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Choose an image from the library</DialogTitle>
                    <DialogDescription>
                        Brand uploads, AI Studio outputs, and previously generated ad creatives.
                    </DialogDescription>
                </DialogHeader>

                <SearchInput
                    placeholder="Search by name or tag…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />

                {loading ? (
                    <div className="flex h-48 items-center justify-center">
                        <Spinner size={24} />
                    </div>
                ) : assets.length === 0 ? (
                    <EmptyState
                        icon={ImageIcon}
                        title="No images found"
                        note={search ? 'Try a different search.' : 'Generate an ad creative or upload media to the brand library first.'}
                    />
                ) : (
                    <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                        {assets.map((asset) => (
                            <button
                                key={asset._id}
                                type="button"
                                onClick={() => { onSelect(asset.url); onOpenChange(false); }}
                                className="group relative aspect-square overflow-hidden rounded-lg border border-border transition hover:border-brand focus-visible:ring-2 focus-visible:ring-ring"
                                title={asset.originalName}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={asset.thumbnailUrl || asset.url}
                                    alt={asset.originalName}
                                    className="h-full w-full object-cover transition group-hover:scale-105"
                                    loading="lazy"
                                />
                                {asset.tags?.includes('ad-creative') && (
                                    <span className="absolute left-1 top-1">
                                        <Chip tone="brand">Ad</Chip>
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
