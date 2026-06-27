'use client';

import NextImage from 'next/image';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, FileText, Image as ImageIcon, Video, Volume2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, IconButton } from '@/components/ui-kit';

interface MediaPreviewProps {
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  filename?: string;
  caption?: string;
}

export function MediaPreview({ type, url, filename, caption }: MediaPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Handle download
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || `download-${Date.now()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('Downloaded successfully');
    } catch (error) {
      toast.error('Failed to download');
      console.error(error);
    } finally {
      setDownloading(false);
    }
  };

  // Render thumbnail
  const renderThumbnail = () => {
    switch (type) {
      case 'image':
        return (
          <button
            type="button"
            className="relative group cursor-pointer rounded-lg overflow-hidden max-w-xs"
            onClick={() => setIsOpen(true)}
          >
            <NextImage
              src={url}
              alt={caption || 'Image'}
              width={0}
              height={0}
              sizes="100vw"
              className="w-full h-auto group-hover:opacity-90 transition-opacity"
              unoptimized
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <ImageIcon className="size-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white p-2 text-sm">
                {caption}
              </div>
            )}
          </button>
        );

      case 'video':
        return (
          <button
            type="button"
            className="relative group cursor-pointer rounded-lg overflow-hidden max-w-xs bg-black"
            onClick={() => setIsOpen(true)}
          >
            <video
              src={url}
              className="w-full h-auto"
              controls={false}
              aria-label={caption || filename || 'Video'}
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <div className="bg-white/90 rounded-full p-4">
                <Video className="size-8 text-foreground" />
              </div>
            </div>
            {caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white p-2 text-sm">
                {caption}
              </div>
            )}
          </button>
        );

      case 'audio':
        return (
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg max-w-xs">
            <div className="bg-primary/10 p-3 rounded-full">
              <Volume2 className="size-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {filename || 'Audio Message'}
              </p>
              <audio src={url} controls className="w-full mt-2" aria-label={filename || 'Audio Message'} />
            </div>
          </div>
        );

      case 'document':
        return (
          <button
            type="button"
            className="flex items-center gap-3 p-3 bg-muted rounded-lg max-w-xs hover:bg-secondary transition-colors cursor-pointer"
            onClick={handleDownload}
          >
            <div className="bg-brand/10 p-3 rounded-full">
              <FileText className="size-6 text-brand" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {filename || 'Document'}
              </p>
              <p className="text-xs text-muted-foreground">Click to download</p>
            </div>
            <Download className="size-4 text-muted-foreground" />
          </button>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {renderThumbnail()}

      {/* Full Screen Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader className="p-4 pb-0">
            <div className="flex items-center justify-between">
              <DialogTitle>{filename || 'Media'}</DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={Download}
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  {downloading ? 'Downloading…' : 'Download'}
                </Button>
                <IconButton icon={X} aria-label="Close" onClick={() => setIsOpen(false)} />
              </div>
            </div>
          </DialogHeader>

          <div className="p-4">
            {type === 'image' && (
              <div className="flex items-center justify-center bg-black rounded-lg">
                <NextImage
                  src={url}
                  alt={caption || 'Image'}
                  width={0}
                  height={0}
                  sizes="100vw"
                  className="max-w-full max-h-[70vh] h-auto w-auto object-contain"
                  unoptimized
                />
              </div>
            )}

            {type === 'video' && (
              <div className="flex items-center justify-center bg-black rounded-lg">
                <video
                  src={url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[70vh]"
                  aria-label={caption || filename || 'Video'}
                />
              </div>
            )}

            {caption && (
              <p className="mt-4 text-sm text-muted-foreground">{caption}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Compact media indicator for message lists
export function MediaIndicator({ type }: { type: string }) {
  const config = {
    image: { icon: ImageIcon, label: 'Image', color: 'text-brand' },
    video: { icon: Video, label: 'Video', color: 'text-danger' },
    audio: { icon: Volume2, label: 'Audio', color: 'text-success' },
    document: { icon: FileText, label: 'Document', color: 'text-info' },
  }[type] || { icon: FileText, label: 'Media', color: 'text-muted-foreground' };

  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1 text-xs ${config.color}`}>
      <Icon className="size-3" />
      <span>{config.label}</span>
    </div>
  );
}
