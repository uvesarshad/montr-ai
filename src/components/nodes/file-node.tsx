
'use client';

import React, { useCallback, memo, useState, ChangeEvent, DragEvent, useEffect } from 'react';
import { Position, NodeProps } from 'reactflow';
import NodeShell from './node-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Paperclip, X, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { ScrollArea } from '../ui/scroll-area';
import { generatePresignedUrl } from '@/ai/flows/generate-presigned-url-flow';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';

interface FileData {
  name: string;
  type: 'image' | 'pdf' | 'text' | 'other';
  url: string; // This will now be the final S3 URL
  textContent?: string | null;
}

const FileNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers } = useNodeUtils(id);

  const [files, setFiles] = useState<FileData[]>(data.files || []);
  const [_isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const textContent = (data.files || [])
      .filter((file: FileData) => file.textContent)
      .map((file: FileData) => `File: ${file.name}\nContent:\n${file.textContent}`)
      .join('\n\n');

    if (textContent) {
      propagateToOutgoers(textContent);
    }
  }, [data.files, propagateToOutgoers]);

  const updateFiles = useCallback(
    (newFiles: FileData[]) => {
      setFiles(newFiles);
      updateNodeData({ files: newFiles });

      const textContent = newFiles
        .filter(file => file.textContent)
        .map(file => `File: ${file.name}\nContent:\n${file.textContent}`)
        .join('\n\n');

      if (textContent) {
        propagateToOutgoers(textContent);
      }
    },
    [updateNodeData, propagateToOutgoers]
  );

  const processAndUploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    toast({ title: 'Uploading file...', description: file.name });

    try {
      // 1. Get pre-signed URL from our new flow
      const { uploadUrl, fileUrl } = await generatePresignedUrl({
        fileName: file.name,
        fileType: file.type,
      });

      // 2. Upload the file directly to Wasabi S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('File upload to storage failed.');
      }

      // 3. Create the file data object for the node
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
      const newFile: FileData = {
        name: file.name,
        url: fileUrl, // Use the final public URL
        type: 'other',
        textContent: null,
      };

      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(fileExtension)) {
        newFile.type = 'image';
      } else if (fileExtension === 'pdf') {
        newFile.type = 'pdf';
      } else if (['txt', 'md', 'json', 'csv'].includes(fileExtension)) {
        newFile.type = 'text';
        newFile.textContent = await file.text();
      }

      updateFiles([...files, newFile]);
      toast({ title: 'Upload complete!', description: file.name });

    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Upload Failed', description: error instanceof Error ? error.message : 'Could not upload the file.' });
    } finally {
      setIsUploading(false);
    }
  }, [files, toast, updateFiles]);

  const removeFile = useCallback((index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    updateFiles(newFiles);
  }, [files, updateFiles]);


  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = event.target.files;
      if (selectedFiles) {
        for (const file of Array.from(selectedFiles)) {
          processAndUploadFile(file);
        }
        event.target.value = '';
      }
    },
    [processAndUploadFile]
  );

  // Drag and drop handlers
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        processAndUploadFile(file);
      }
      e.dataTransfer.clearData();
    }
  };

  return (
    <NodeShell
      id={id}
      nodeType="fileNode"
      selected={selected}
      onDelete={deleteNode}
      minWidth={320}
      contentClassName="p-1"
      title="File Storage"
      icon={<Paperclip className="h-full w-full" />}
    >
      <NodeHandle type="target" position={Position.Left} nodeType="fileNode" isConnectable={isConnectable} />

      <div
        className="w-full h-full flex flex-col"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {files.length > 0 ? (
          <ScrollArea className="flex-1 w-full max-h-[400px] nodrag">
            <div className="flex flex-col gap-2 p-2 pb-4">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="group relative w-full overflow-hidden rounded-[20px] bg-muted/30 border border-border/10 p-2 flex items-center gap-3">
                  <div className="size-10 shrink-0 rounded-xl bg-background border flex items-center justify-center relative overflow-hidden">
                    {file.type === 'image' ? (
                      <Image src={file.url} alt={file.name} fill className="object-cover" />
                    ) : (
                      <Paperclip className="size-5 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-sm font-medium truncate mb-0.5">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{file.type}</p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 size-5 rounded-full hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeFile(index)}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}

              <label htmlFor={`file-upload-more-${id}`} className="cursor-pointer">
                <div className="border border-dashed border-muted-foreground/20 rounded-[20px] p-4 text-center hover:bg-muted/30 transition-colors flex items-center justify-center gap-2">
                  <Upload className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">Add another file</span>
                </div>
                <Input id={`file-upload-more-${id}`} type="file" className="sr-only" onChange={handleFileChange} multiple />
              </label>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full py-8 px-4 text-center">
            <label htmlFor={`file-upload-${id}`} className="cursor-pointer flex flex-col items-center gap-3 w-full border border-dashed border-neutral-300 dark:border-neutral-700 rounded-[28px] p-[25px] hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
              <div className="size-10 bg-neutral-100 dark:bg-neutral-800 rounded-xl flex items-center justify-center mb-1">
                <Upload className="size-5 text-neutral-500 dark:text-neutral-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Upload files</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Drag and drop or click to upload</p>
              </div>
              <Input id={`file-upload-${id}`} type="file" className="sr-only" onChange={handleFileChange} multiple />
            </label>
            {isUploading && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center rounded-[28px] z-50">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            )}
          </div>
        )}
      </div>

      <NodeHandle type="source" position={Position.Right} nodeType="fileNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(FileNode);
