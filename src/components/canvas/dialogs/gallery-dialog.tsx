'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, Loader2, FolderOpen, ImageIcon } from 'lucide-react';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import type { AnchorPoint } from '../canvas-toolbar';

interface GalleryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectImage: (imageUrl: string, source: 'library' | 'stock') => void;
    isCollapsed: boolean;
    anchorPoint: AnchorPoint;
}

interface StockImage {
    id: string;
    url: string;
    thumbnailUrl: string;
    source: 'unsplash' | 'pexels' | 'pixabay';
    author: string;
    authorUrl: string;
}

interface LibraryAsset {
    _id: string;
    url: string;
    name: string;
    type: string;
    createdAt: string;
}

export function GalleryDialog({
    open,
    onOpenChange,
    onSelectImage,
    isCollapsed,
    anchorPoint,
}: GalleryDialogProps) {
    const [activeTab, setActiveTab] = useState<'library' | 'stock'>('library');
    const [searchQuery, setSearchQuery] = useState('');
    const [stockImages, setStockImages] = useState<StockImage[]>([]);
    const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Fetch library assets
    useEffect(() => {
        if (open && activeTab === 'library') {
            fetchLibraryAssets();
        }
    }, [open, activeTab]);

    const fetchLibraryAssets = async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/api/v2/media-library?type=image&limit=50');
            if (response.ok) {
                const data = await response.json();
                setLibraryAssets(data.assets || []);
            }
        } catch (error) {
            console.error('Failed to fetch library assets:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const searchStockImages = async () => {
        if (!searchQuery.trim()) return;

        try {
            setIsLoading(true);
            const response = await fetch(`/api/v2/stock-images?query=${encodeURIComponent(searchQuery)}`);
            if (response.ok) {
                const data = await response.json();
                setStockImages(data.results || []);
            }
        } catch (error) {
            console.error('Failed to search stock images:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && activeTab === 'stock') {
            searchStockImages();
        }
    };

    const handleSelect = () => {
        if (selectedImage) {
            onSelectImage(selectedImage, activeTab);
            onOpenChange(false);
        }
    };

    const dialogTop = 80;
    const dialogLeft = isCollapsed ? 152 : 352;
    const originX = anchorPoint.x - dialogLeft;
    const originY = anchorPoint.y - dialogTop;

    return (
        <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
            <DialogContent
                className={cn(
                    "p-0 max-w-[320px] h-[calc(100vh-10rem)] top-[5rem] translate-x-0 translate-y-0 bg-white/95 dark:bg-black/95 backdrop-blur-xl shadow-2xl dark:shadow-[0_10px_30px_-5px_rgba(255,255,255,0.3)] border border-border/40 rounded-[28px] overflow-hidden",
                    "data-[state=open]:!animate-in data-[state=open]:!fade-in-0 data-[state=open]:!zoom-in-0 data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0 duration-300",
                    isCollapsed ? "left-[9.5rem]" : "left-[22rem]"
                )}
                style={{ transformOrigin: `${originX}px ${originY}px` }}
                onPointerDownOutside={(e) => e.preventDefault()}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogTitle className="sr-only">Gallery</DialogTitle>
                <div className="flex flex-col h-full p-4">
                    {/* Header */}
                    <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">Gallery</h2>

                    {/* Tabs */}
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'library' | 'stock')} className="flex-1 flex flex-col">
                        <TabsList className="w-full mb-3 grid grid-cols-2">
                            <TabsTrigger value="library" className="text-xs">
                                <FolderOpen className="size-3.5 mr-1.5" />
                                My Files
                            </TabsTrigger>
                            <TabsTrigger value="stock" className="text-xs">
                                <ImageIcon className="size-3.5 mr-1.5" />
                                Stock
                            </TabsTrigger>
                        </TabsList>

                        {/* Search */}
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <Input
                                placeholder="Search Assets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="pl-9 h-9 bg-background/50 border-border/40 rounded-full text-sm"
                            />
                        </div>

                        <TabsContent value="library" className="flex-1 m-0">
                            <ScrollArea className="h-full pr-2" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : libraryAssets.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {libraryAssets.map((asset) => (
                                            <button
                                                type="button"
                                                key={asset._id}
                                                onClick={() => setSelectedImage(asset.url)}
                                                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${selectedImage === asset.url
                                                    ? 'border-primary ring-2 ring-primary/20'
                                                    : 'border-transparent hover:border-border'
                                                    }`}
                                            >
                                                <Image
                                                    src={asset.url}
                                                    alt={asset.name}
                                                    fill
                                                    className="object-cover"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                        <FolderOpen className="size-10 mb-3" />
                                        <p className="text-xs">No images in your library</p>
                                    </div>
                                )}
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="stock" className="flex-1 m-0">
                            <ScrollArea className="h-full pr-2" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : stockImages.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {stockImages.map((image) => (
                                            <button
                                                type="button"
                                                key={image.id}
                                                onClick={() => setSelectedImage(image.url)}
                                                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group ${selectedImage === image.url
                                                    ? 'border-primary ring-2 ring-primary/20'
                                                    : 'border-transparent hover:border-border'
                                                    }`}
                                            >
                                                <Image
                                                    src={image.thumbnailUrl}
                                                    alt={`By ${image.author}`}
                                                    fill
                                                    className="object-cover"
                                                />
                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <p className="text-[10px] text-white truncate">
                                                        {image.author}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : searchQuery ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                        <ImageIcon className="size-10 mb-3" />
                                        <p className="text-xs">No results for &quot;{searchQuery}&quot;</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                        <Search className="size-10 mb-3" />
                                        <p className="text-xs text-center">Search for free stock images</p>
                                        <p className="text-[10px] mt-2 text-center">Unsplash, Pexels & Pixabay</p>
                                    </div>
                                )}
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t">
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
                            Cancel
                        </Button>
                        <Button size="sm" onClick={handleSelect} disabled={!selectedImage} className="h-8 text-xs">
                            Insert
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
