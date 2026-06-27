'use client';

import Image from 'next/image';
import { Attachment } from '@/types/crm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  FileText,
  File,
  Shield,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AttachmentPreviewProps {
  attachment: Attachment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNext?: () => void;
  onPrev?: () => void;
}

/**
 * Modal to preview attachments
 *
 * Features:
 * - Large preview for images
 * - PDF viewer (iframe)
 * - Document info for non-previewable files
 * - Download button
 * - Previous/Next navigation
 * - Close button
 */
export function AttachmentPreview({
  attachment,
  open,
  onOpenChange,
  onNext,
  onPrev,
}: AttachmentPreviewProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getScanStatusBadge = () => {
    switch (attachment.scanStatus) {
      case 'clean':
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <Shield className="mr-1 size-3" />
            Clean
          </Badge>
        );
      case 'infected':
        return (
          <Badge variant="outline" className="text-red-600 border-red-600">
            <ShieldAlert className="mr-1 size-3" />
            Infected
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <AlertCircle className="mr-1 size-3" />
            Scan Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Scanning...
          </Badge>
        );
    }
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
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const _canPreview = (): boolean => {
    return (
      attachment.mimeType.startsWith('image/') ||
      attachment.mimeType === 'application/pdf'
    );
  };

  const renderPreview = () => {
    // Image preview
    if (attachment.mimeType.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4">
          <Image
            src={attachment.fileUrl}
            alt={attachment.fileName}
            width={0}
            height={0}
            sizes="100vw"
            className="max-h-[60vh] max-w-full h-auto w-auto object-contain rounded"
            unoptimized
          />
        </div>
      );
    }

    // PDF preview
    if (attachment.mimeType === 'application/pdf') {
      return (
        <div className="bg-muted/30 rounded-lg overflow-hidden" style={{ height: '60vh' }}>
          <iframe
            src={attachment.fileUrl}
            className="w-full h-full"
            title={attachment.fileName}
          />
        </div>
      );
    }

    // Non-previewable file info
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-4 bg-muted rounded-full mb-4">
          {attachment.mimeType.includes('pdf') ? (
            <FileText className="size-12 text-muted-foreground" />
          ) : (
            <File className="size-12 text-muted-foreground" />
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Preview not available for this file type
        </p>
        <Button onClick={handleDownload}>
          <Download className="mr-2 size-4" />
          Download File
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between pr-8">
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate pr-4">{attachment.fileName}</DialogTitle>
              <div className="flex items-center gap-x-3 mt-2 text-sm text-muted-foreground">
                <span>{formatFileSize(attachment.fileSize)}</span>
                <span>•</span>
                <span>
                  {formatDistanceToNow(new Date(attachment.createdAt), { addSuffix: true })}
                </span>
                <span>•</span>
                {getScanStatusBadge()}
              </div>
              {attachment.description && (
                <p className="text-sm text-muted-foreground mt-2">{attachment.description}</p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Preview Content */}
        <div className="flex-1 overflow-y-auto">
          {renderPreview()}
        </div>

        {/* Navigation and Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-x-2">
            {onPrev && (
              <Button variant="outline" size="sm" onClick={onPrev}>
                <ChevronLeft className="size-4 mr-1" />
                Previous
              </Button>
            )}
            {onNext && (
              <Button variant="outline" size="sm" onClick={onNext}>
                Next
                <ChevronRight className="size-4 ml-1" />
              </Button>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="size-4 mr-2" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
