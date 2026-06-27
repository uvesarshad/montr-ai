'use client';

import { useState } from 'react';
import { useAttachments } from '@/hooks/crm/use-attachments';
import { AttachmentItem } from './attachment-item';
import { AttachmentUpload } from './attachment-upload';
import { AttachmentPreview } from './attachment-preview';
import { Attachment } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Grid3x3, List, Upload, Paperclip } from 'lucide-react';

interface AttachmentListProps {
  targetType: 'contact' | 'company' | 'deal' | 'activity' | 'comment' | 'email';
  targetId: string;
  showUpload?: boolean;
}

/**
 * Grid/list of attachments
 *
 * Features:
 * - Display all attachments for a target entity
 * - Grid view (thumbnails for images) or list view
 * - File name, size, type, uploaded by, date
 * - Download button
 * - Delete button (for owner/admin)
 * - Empty state when no attachments
 * - Loading state
 */
export function AttachmentList({
  targetType,
  targetId,
  showUpload = true,
}: AttachmentListProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  const {
    attachments,
    loading,
    error,
    uploading,
    refetch,
    uploadAttachment,
    deleteAttachment,
    updateAttachment,
  } = useAttachments({ targetType, targetId });

  const handleUpload = async (files: File[]) => {
    for (const file of files) {
      try {
        await uploadAttachment(file, targetType, targetId);
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    }
    await refetch();
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAttachment(id);
      await refetch();
    } catch (error) {
      console.error('Error deleting attachment:', error);
    }
  };

  const handlePreview = (attachment: Attachment) => {
    const index = attachments.findIndex((a) => a._id === attachment._id);
    setPreviewIndex(index);
    setPreviewAttachment(attachment);
  };

  const handleNextPreview = () => {
    if (previewIndex < attachments.length - 1) {
      const nextIndex = previewIndex + 1;
      setPreviewIndex(nextIndex);
      setPreviewAttachment(attachments[nextIndex]);
    }
  };

  const handlePrevPreview = () => {
    if (previewIndex > 0) {
      const prevIndex = previewIndex - 1;
      setPreviewIndex(prevIndex);
      setPreviewAttachment(attachments[prevIndex]);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-32" />
          <div className="flex items-center gap-x-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const).map((k) => (
            <Skeleton key={k} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>Failed to load attachments: {error}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-x-2">
          <Paperclip className="size-5 text-muted-foreground" />
          <h3 className="text-sm font-medium">
            Attachments ({attachments.length})
          </h3>
        </div>

        <div className="flex items-center gap-x-2">
          {showUpload && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsUploadOpen(!isUploadOpen)}
            >
              <Upload className="mr-2 size-4" />
              Upload
            </Button>
          )}

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'list')}>
            <TabsList className="h-9">
              <TabsTrigger value="grid" className="px-2">
                <Grid3x3 className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="list" className="px-2">
                <List className="size-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Upload Section */}
      {isUploadOpen && (
        <AttachmentUpload
          onUpload={handleUpload}
          uploading={uploading}
          onClose={() => setIsUploadOpen(false)}
        />
      )}

      {/* Attachments Grid/List */}
      {attachments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          <Paperclip className="size-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No attachments yet</p>
          <p className="text-xs mt-1">Upload files to get started</p>
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
              : 'space-y-2'
          }
        >
          {attachments.map((attachment) => (
            <AttachmentItem
              key={attachment._id}
              attachment={attachment}
              viewMode={viewMode}
              onDelete={handleDelete}
              onPreview={handlePreview}
              onUpdate={updateAttachment}
            />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewAttachment && (
        <AttachmentPreview
          attachment={previewAttachment}
          open={!!previewAttachment}
          onOpenChange={(open) => !open && setPreviewAttachment(null)}
          onNext={previewIndex < attachments.length - 1 ? handleNextPreview : undefined}
          onPrev={previewIndex > 0 ? handlePrevPreview : undefined}
        />
      )}
    </div>
  );
}
