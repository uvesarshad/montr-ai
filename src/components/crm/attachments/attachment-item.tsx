'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Attachment } from '@/types/crm';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import {
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  File,
  Download,
  Trash,
  MoreVertical,
  Eye,
  Shield,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AttachmentItemProps {
  attachment: Attachment;
  viewMode: 'grid' | 'list';
  onDelete: (id: string) => Promise<void>;
  onPreview: (attachment: Attachment) => void;
  onUpdate: (id: string, description: string) => Promise<Attachment>;
}

/**
 * Individual attachment card
 *
 * Features:
 * - File icon or image thumbnail
 * - File name (truncated if long)
 * - File size (formatted: KB, MB)
 * - Upload date (relative time)
 * - Uploaded by (user name)
 * - Download button
 * - More menu (rename, delete)
 * - Virus scan status indicator
 */
export function AttachmentItem({
  attachment,
  viewMode,
  onDelete,
  onPreview,
  onUpdate: _onUpdate,
}: AttachmentItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="size-8" />;
    } else if (mimeType.startsWith('video/')) {
      return <Video className="size-8" />;
    } else if (mimeType.startsWith('audio/')) {
      return <Music className="size-8" />;
    } else if (mimeType.includes('pdf')) {
      return <FileText className="size-8" />;
    }
    return <File className="size-8" />;
  };

  const getScanStatusIcon = () => {
    switch (attachment.scanStatus) {
      case 'clean':
        return <Shield className="size-4 text-green-500" />;
      case 'infected':
        return <ShieldAlert className="size-4 text-red-500" />;
      case 'error':
        return <AlertCircle className="size-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const canPreview = (mimeType: string): boolean => {
    return (
      mimeType.startsWith('image/') ||
      mimeType === 'application/pdf' ||
      mimeType.startsWith('text/')
    );
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(attachment.fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to download file',
      });
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this attachment?')) {
      return;
    }

    try {
      setIsDeleting(true);
      await onDelete(attachment._id);
      toast({
        title: 'Success',
        description: 'Attachment deleted successfully',
      });
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete attachment',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (viewMode === 'grid') {
    return (
      <div className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow group">
        {/* Thumbnail/Icon */}
        <div className="relative aspect-video bg-muted flex items-center justify-center">
          {attachment.mimeType.startsWith('image/') ? (
            <Image
              fill
              src={attachment.thumbnailUrl || attachment.fileUrl}
              alt={attachment.fileName}
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="text-muted-foreground">{getFileIcon(attachment.mimeType)}</div>
          )}

          {/* Scan Status Badge */}
          {attachment.scanStatus !== 'pending' && (
            <div className="absolute top-2 right-2">
              <div className="bg-background/80 backdrop-blur-sm rounded-full p-1">
                {getScanStatusIcon()}
              </div>
            </div>
          )}

          {/* Hover Actions */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-x-2">
            {canPreview(attachment.mimeType) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onPreview(attachment)}
              >
                <Eye className="size-4" />
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
            >
              <Download className="size-4" />
            </Button>
          </div>
        </div>

        {/* File Info */}
        <div className="p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={attachment.fileName}>
                {attachment.fileName}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatFileSize(attachment.fileSize)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(attachment.createdAt), { addSuffix: true })}
              </p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="size-8 p-0">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownload}>
                  <Download className="mr-2 size-4" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-destructive"
                >
                  <Trash className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="flex items-center gap-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
      {/* Icon */}
      <div className="flex-shrink-0">
        {attachment.mimeType.startsWith('image/') ? (
          <Image
            src={attachment.thumbnailUrl || attachment.fileUrl}
            alt={attachment.fileName}
            width={48}
            height={48}
            className="size-12 object-cover rounded"
            unoptimized
          />
        ) : (
          <div className="size-12 bg-muted rounded flex items-center justify-center text-muted-foreground">
            {getFileIcon(attachment.mimeType)}
          </div>
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-x-2">
          <p className="text-sm font-medium truncate" title={attachment.fileName}>
            {attachment.fileName}
          </p>
          {attachment.scanStatus !== 'pending' && (
            <div>{getScanStatusIcon()}</div>
          )}
        </div>
        <div className="flex items-center gap-x-3 text-xs text-muted-foreground mt-1">
          <span>{formatFileSize(attachment.fileSize)}</span>
          <span>•</span>
          <span>{formatDistanceToNow(new Date(attachment.createdAt), { addSuffix: true })}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-x-1">
        {canPreview(attachment.mimeType) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPreview(attachment)}
          >
            <Eye className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
        >
          <Download className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="size-8 p-0">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive"
            >
              <Trash className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
