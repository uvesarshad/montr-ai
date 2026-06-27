
'use client';

import React, { useCallback, memo, useState, ChangeEvent, DragEvent, useEffect } from 'react';
import { Position, NodeProps } from 'reactflow';
import NodeShell from './node-shell';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { imageToText } from '@/ai/flows/image-to-text-flow';
import { fetchRemoteImage } from '@/ai/flows/fetch-remote-image-flow';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';


interface ImageFile {
  name: string;
  type: string;
  previewUrl: string;
  file?: File;
  url?: string;
  extractedText?: string;
  analysis?: string;
}

const ImageNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers } = useNodeUtils(id);

  const [files, setFiles] = useState<ImageFile[]>(data.files || []);
  const [_isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fullTextOutput = (data.files || [])
      .map((file: ImageFile) => {
        const parts = [];
        if (file.analysis) parts.push(`Analysis: ${file.analysis}`);
        if (file.extractedText) parts.push(`\nText:\n${file.extractedText}`);
        return parts.join('\n');
      })
      .filter(Boolean)
      .join('\n\n');

    if (fullTextOutput) {
      propagateToOutgoers(fullTextOutput);
    }
  }, [data.files, propagateToOutgoers]);

  const updateFiles = useCallback(
    (newFiles: ImageFile[]) => {
      setFiles(newFiles);
      updateNodeData({ files: newFiles });
    },
    [updateNodeData]
  );

  const processTextExtraction = useCallback(async (imageDataUri: string, fileIndex: number) => {
    setIsLoading(true);
    toast({ title: 'AI is analyzing image...', description: 'Extracting text and content.' });
    try {
      const result = await imageToText({ photoDataUri: imageDataUri });

      setFiles(currentFiles => {
        const updatedFiles = [...currentFiles];
        if (updatedFiles[fileIndex]) {
          updatedFiles[fileIndex].extractedText = result.text;
          updatedFiles[fileIndex].analysis = result.analysis;
        }
        updateNodeData({ files: updatedFiles });
        return updatedFiles;
      });

      const fullOutput = `Analysis: ${result.analysis}${result.text ? `\n\nText:\n${result.text}` : ''}`;
      propagateToOutgoers(fullOutput);

      if (result.analysis || result.text) {
        toast({ title: 'Analysis Complete', description: 'Image content and text have been extracted.' });
      } else {
        toast({ title: 'No Content Found', description: 'The AI could not find any text or content.' });
      }

    } catch (error) {
      console.error("Image analysis failed", error);
      toast({ variant: 'destructive', title: 'Analysis Failed', description: error instanceof Error ? error.message : 'Could not analyze the image.' });
    } finally {
      setIsLoading(false);
    }
  }, [propagateToOutgoers, toast, updateNodeData]);

  useEffect(() => {
    if (JSON.stringify(data.files) !== JSON.stringify(files)) {
      setFiles(data.files || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.files]);

  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';

    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'heic', 'raw'];

    if (imageExtensions.includes(fileExtension)) {
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const newImageFile: ImageFile = {
          name: file.name,
          file: file,
          type: 'image',
          previewUrl: result,
        };
        // This node will only handle one image at a time.
        const newFiles = [newImageFile];
        updateFiles(newFiles);
        processTextExtraction(result, 0); // Process the new file
      };
      reader.readAsDataURL(file);
    }
  }, [updateFiles, processTextExtraction]);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = event.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        processFile(selectedFiles[0]); // Process only the first file
        event.target.value = '';
      }
    },
    [processFile]
  );

  const handleUrlChange = useCallback(async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const target = event.target as HTMLInputElement;
      const url = target.value;
      if (!url) return;

      setIsLoading(true);
      toast({ title: 'Fetching image...', description: 'Securely downloading image from URL.' });

      try {
        // Use secure server-side fetch with SSRF protection
        const result = await fetchRemoteImage(url);

        if (!result.success || !result.dataUri) {
          throw new Error(result.error || 'Failed to fetch image');
        }

        const urlFileName = url.substring(url.lastIndexOf('/') + 1).split('?')[0] || url;
        const newImageFile: ImageFile = {
          name: urlFileName,
          url: url,
          type: 'image',
          previewUrl: result.dataUri,
        };

        updateFiles([newImageFile]);
        processTextExtraction(result.dataUri, 0);
        target.value = '';

      } catch (error) {
        toast({ variant: 'destructive', title: 'URL Fetch Failed', description: error instanceof Error ? error.message : 'Could not fetch image from the provided URL.' });
        console.error(error);
        setIsLoading(false);
      }
    }
  }, [updateFiles, processTextExtraction, toast]);

  const removeFile = useCallback((index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    updateFiles(newFiles);
  }, [files, updateFiles]);


  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  return (
    <NodeShell
      id={id}
      nodeType="imageNode"
      selected={selected}
      onDelete={deleteNode}
      className={cn("bg-white dark:bg-black overflow-hidden")}
      contentClassName="p-1 items-center justify-center min-h-[200px]"
      title="Image"
      icon={<ImageIcon className="h-full w-full" />}
    >
      <div
        className="w-full h-full flex flex-col items-center justify-center"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {files.length > 0 ? (
          <div className="w-full h-full relative group">
            <div className="relative w-full h-full min-h-[200px] overflow-hidden rounded-[24px]">
              <Image
                src={files[0].previewUrl}
                alt={files[0].name}
                fill
                className="object-cover"
              />
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-3 left-3 size-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-transparent hover:bg-transparent"
                    onClick={() => removeFile(0)}
                  >
                    <div className="bg-white rounded-full p-0.5 shadow-sm">
                      <X className="size-4 text-red-500" />
                    </div>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" alignOffset={10} className="rounded-xl rounded-tl-none bg-white text-black border border-neutral-200 shadow-md text-[10px] px-2 py-1" sideOffset={2}>
                  <p>Remove Image</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full py-8 gap-4 px-4 text-center">
            <label htmlFor={`file-upload-${id}`} className="cursor-pointer flex flex-col items-center gap-3 w-full border border-dashed border-neutral-300 dark:border-neutral-700 rounded-[28px] p-[25px] hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
              <div className="size-10 bg-neutral-100 dark:bg-neutral-800 rounded-xl flex items-center justify-center mb-1">
                {isLoading ? <Loader2 className="size-5 animate-spin text-neutral-500" /> : <Upload className="size-5 text-neutral-500 dark:text-neutral-400" />}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Upload a file</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Drag and drop or click to upload</p>
              </div>
              <Input id={`file-upload-${id}`} type="file" className="sr-only" onChange={handleFileChange} accept="image/*" disabled={isLoading} />
            </label>
            <div className="w-full max-w-[90%] mx-auto">
              <Input
                id={`url-input-${id}`}
                placeholder="or paste URL"
                className="text-xs h-8 bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-center rounded-lg focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                onKeyDown={handleUrlChange}
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        <NodeHandle type="source" position={Position.Right} nodeType="imageNode" isConnectable={isConnectable} id="text-output" />
        <NodeHandle type="target" position={Position.Left} nodeType="imageNode" isConnectable={isConnectable} />
      </div>
    </NodeShell>
  );
};

export default memo(ImageNode);
