/**
 * Cover Image Upload Component for Documents
 */
'use client';

import { useState } from 'react';
import { Button, Input } from '@/components/ui-kit';
import { Label } from '@/components/ui/label';
import { X, Loader2, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

interface CoverImageUploadProps {
    documentId: string;
    currentCoverImage?: string;
    onImageUpdate: (imageUrl: string | null) => void;
}

export function CoverImageUpload({ documentId, currentCoverImage, onImageUpdate }: CoverImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentCoverImage || null);
    const { toast } = useToast();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast({
                variant: 'destructive',
                title: 'Invalid file type',
                description: 'Please upload an image file (JPG, PNG, GIF, WebP)',
            });
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast({
                variant: 'destructive',
                title: 'File too large',
                description: 'Image must be less than 5MB',
            });
            return;
        }

        setIsUploading(true);

        try {
            // Create FormData for upload
            const formData = new FormData();
            formData.append('file', file);
            formData.append('documentId', documentId);

            // Upload to server
            const response = await fetch('/api/v2/documents/upload-cover', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();

            setPreviewUrl(data.url);
            onImageUpdate(data.url);

            toast({
                title: 'Cover image uploaded',
                description: 'Your cover image has been updated successfully',
            });
        } catch (error) {
            console.error('Upload error:', error);
            toast({
                variant: 'destructive',
                title: 'Upload failed',
                description: 'Failed to upload cover image. Please try again.',
            });
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = async () => {
        setIsUploading(true);

        try {
            const response = await fetch('/api/v2/documents/upload-cover', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ documentId }),
            });

            if (!response.ok) {
                throw new Error('Remove failed');
            }

            setPreviewUrl(null);
            onImageUpdate(null);

            toast({
                title: 'Cover image removed',
                description: 'Your cover image has been removed',
            });
        } catch (error) {
            console.error('Remove error:', error);
            toast({
                variant: 'destructive',
                title: 'Remove failed',
                description: 'Failed to remove cover image. Please try again.',
            });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label>Cover Image</Label>
                {previewUrl && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemove}
                        disabled={isUploading}
                    >
                        <X className="size-4 mr-1" />
                        Remove
                    </Button>
                )}
            </div>

            {previewUrl ? (
                <div className="relative w-full h-48 rounded-lg overflow-hidden border bg-muted">
                    <Image
                        src={previewUrl}
                        alt="Cover image"
                        fill
                        className="object-cover"
                    />
                </div>
            ) : (
                <div className="relative">
                    <Input
                        id="cover-image"
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        disabled={isUploading}
                        className="hidden"
                    />
                    <Label
                        htmlFor="cover-image"
                        className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                        {isUploading ? (
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="size-8 animate-spin text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">Uploading...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <ImageIcon className="size-8 text-muted-foreground" />
                                <div className="text-center">
                                    <p className="text-sm font-medium">Click to upload cover image</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        JPG, PNG, GIF or WebP (max 5MB)
                                    </p>
                                </div>
                            </div>
                        )}
                    </Label>
                </div>
            )}
        </div>
    );
}
