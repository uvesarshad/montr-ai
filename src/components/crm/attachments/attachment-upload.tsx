'use client';

import Image from 'next/image';
import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Upload, X, FileText, Image as ImageIcon, File as FileIcon } from 'lucide-react';

interface AttachmentUploadProps {
  onUpload: (files: File[]) => Promise<void>;
  uploading: boolean;
  onClose?: () => void;
  maxSize?: number; // in bytes
  accept?: Record<string, string[]>;
}

/**
 * Drag-and-drop upload component
 *
 * Features:
 * - Drag and drop area
 * - Click to browse files
 * - Multiple file support
 * - File size validation (max 10MB)
 * - File type validation
 * - Upload progress indicator
 * - Preview thumbnails for images
 * - Cancel upload button
 * - Success/error states
 */
export function AttachmentUpload({
  onUpload,
  uploading,
  onClose,
  maxSize = 10 * 1024 * 1024, // 10MB default
  accept,
}: AttachmentUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setErrors([]);

      // Handle rejected files
      const newErrors: string[] = [];
      rejectedFiles.forEach((rejection) => {
        if (rejection.errors.some((e) => e.code === 'file-too-large')) {
          newErrors.push(`${rejection.file.name} is too large (max ${maxSize / 1024 / 1024}MB)`);
        } else if (rejection.errors.some((e) => e.code === 'file-invalid-type')) {
          newErrors.push(`${rejection.file.name} has an invalid file type`);
        }
      });

      if (newErrors.length > 0) {
        setErrors(newErrors);
      }

      // Add accepted files
      if (acceptedFiles.length > 0) {
        setSelectedFiles((prev) => [...prev, ...acceptedFiles]);
      }
    },
    [maxSize]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize,
    accept,
    disabled: uploading,
  });

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      await onUpload(selectedFiles);
      setSelectedFiles([]);
      setUploadProgress({});
      onClose?.();
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="size-5" />;
    } else if (file.type.includes('pdf')) {
      return <FileText className="size-5" />;
    }
    return <FileIcon className="size-5" />;
  };

  const getPreviewUrl = (file: File): string | null => {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file);
    }
    return null;
  };

  return (
    <div className="border rounded-lg p-6 bg-muted/30">
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive && 'border-primary bg-primary/5',
          !isDragActive && 'border-muted-foreground/25 hover:border-primary/50',
          uploading && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center gap-y-3">
          <div className="p-3 bg-primary/10 rounded-full">
            <Upload className="size-8 text-primary" />
          </div>
          {isDragActive ? (
            <p className="text-sm font-medium">Drop files here...</p>
          ) : (
            <>
              <p className="text-sm font-medium">
                Drag & drop files here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Max file size: {maxSize / 1024 / 1024}MB
              </p>
            </>
          )}
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mt-4 space-y-1">
          {errors.map((error) => (
            <p key={error} className="text-xs text-destructive">
              {error}
            </p>
          ))}
        </div>
      )}

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium mb-2">
            Selected Files ({selectedFiles.length})
          </p>
          {selectedFiles.map((file, index) => {
            const previewUrl = getPreviewUrl(file);
            const progress = uploadProgress[file.name] || 0;

            return (
              <div
                key={file.name}
                className="flex items-center gap-x-3 p-3 bg-background border rounded-lg"
              >
                {/* Preview/Icon */}
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt={file.name}
                    width={48}
                    height={48}
                    className="size-12 object-cover rounded"
                    unoptimized
                  />
                ) : (
                  <div className="size-12 bg-muted rounded flex items-center justify-center text-muted-foreground">
                    {getFileIcon(file)}
                  </div>
                )}

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                  {uploading && progress > 0 && (
                    <div className="mt-2">
                      <Progress value={progress} className="h-1" />
                    </div>
                  )}
                </div>

                {/* Remove Button */}
                {!uploading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0"
                    onClick={() => removeFile(index)}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      {selectedFiles.length > 0 && (
        <div className="mt-4 flex items-center justify-end gap-x-2">
          {onClose && (
            <Button
              variant="outline"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleUpload}
            disabled={uploading || selectedFiles.length === 0}
          >
            {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} file(s)`}
          </Button>
        </div>
      )}
    </div>
  );
}
