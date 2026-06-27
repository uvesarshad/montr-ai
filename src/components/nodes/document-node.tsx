'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { Position, NodeProps, useReactFlow, getIncomers } from 'reactflow';
import NodeShell from './node-shell';
import { Button } from '@/components/ui/button';
import { FileText, Download, Globe, Loader2, Save, Pencil, Maximize2 } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { publishToWordPress } from '@/ai/flows';
import { type Editor as TipTapEditor } from '@tiptap/react';
import { useUser } from '@/hooks/use-user';
import * as cheerio from 'cheerio';
import { Editor, EditorToolbar, EditorToolbarCompact } from '../editor';
import { Input } from '@/components/ui/input';
import NodeHandle from './node-handle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';


interface EditableTitleProps {
  name: string;
  isEditingName: boolean;
  onStartEdit: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const EditableTitle = ({ name, isEditingName, onStartEdit, onChange, onBlur, onKeyDown }: EditableTitleProps) => (
  <div className="flex items-center gap-1 cursor-pointer" onClick={onStartEdit}>
    {isEditingName ? (
      <Input
        value={name}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="nodrag h-5 text-[10px] font-medium w-24 px-1"
        autoFocus
        onClick={(e) => e.stopPropagation()}
      />
    ) : (
      <>
        <span className="text-[10px] font-medium uppercase tracking-wider truncate max-w-[100px]">{name}</span>
        <Pencil className="size-2.5 opacity-50" />
      </>
    )}
  </div>
);

const DocumentNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { getNodes, getEdges } = useReactFlow();
  const { user } = useUser();
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers, getIncomingContent } = useNodeUtils(id);

  const isUpdatingFromInput = useRef(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [docId, setDocId] = useState(data.docId || null);
  const [name, setName] = useState(data.name || 'Untitled');
  const [isEditingName, setIsEditingName] = useState(false);
  const [content, setContent] = useState(data.content || '');
  const [editorInstance, setEditorInstance] = useState<TipTapEditor | null>(null);
  const [isExpandedOpen, setIsExpandedOpen] = useState(false);

  // Handle incoming data from connected nodes
  const edges = getEdges();
  useEffect(() => {
    const allNodes = getNodes();
    const currentNode = allNodes.find(n => n.id === id);
    if (!currentNode) return;

    const incomers = getIncomers(currentNode, allNodes, edges);
    if (incomers.length === 0) return;

    isUpdatingFromInput.current = true;
    const incomingText = getIncomingContent();

    if (incomingText && content !== incomingText) {
      setContent(incomingText);
      updateNodeData({ content: incomingText });
    }

    const timer = setTimeout(() => {
      isUpdatingFromInput.current = false;
    }, 100);
    return () => clearTimeout(timer);
  }, [edges, id, getNodes, updateNodeData, getIncomingContent, content]);

  const handleSaveToDocs = async () => {
    if (!content || !user) {
      toast({ variant: 'destructive', title: 'Error', description: 'Cannot save document. Content or user not available.' });
      return;
    }

    setIsSaving(true);
    toast({ title: 'Saving to Docs...', description: 'Please wait.' });

    const $ = cheerio.load(content);
    const titleFromContent = $('h1').first().text() || 'Untitled Document';
    const finalTitle = name || titleFromContent;

    try {
      if (docId) {
        // Update existing document
        const res = await fetch(`/api/v2/documents/${docId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: finalTitle,
            content: content,
          })
        });
        if (!res.ok) throw new Error('Failed to update document');
      } else {
        // Create new document
        const res = await fetch('/api/v2/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: finalTitle,
            content: content,
            parentId: null,
            isPublished: false,
          })
        });
        if (!res.ok) throw new Error('Failed to create document');

        const newDoc = await res.json();
        const newId = newDoc.id || newDoc._id;

        if (newId) {
          setDocId(newId);
          updateNodeData({ docId: newId });
        }
      }

      toast({ title: 'Document Saved!', description: `"${finalTitle}" has been saved to your docs.` });
    } catch (error) {
      console.error('Failed to save document:', error);
      toast({ variant: 'destructive', title: 'Save Failed', description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSaving(false);
    }
  };


  const handlePublish = async (platform: string) => {
    if (!content || platform !== 'WordPress') {
      toast({
        title: `Publishing to ${platform}...`,
        description: 'This feature is not yet implemented.',
      });
      return;
    }

    setIsPublishing(true);
    toast({ title: 'Publishing to WordPress...', description: 'Please wait.' });

    const $ = cheerio.load(content);
    const firstH1 = $('h1').first();
    const titleFromContent = firstH1.text() || 'Untitled Post';
    const finalTitle = name || titleFromContent;

    if (firstH1.length) {
      firstH1.remove();
    }
    const contentWithoutTitle = $('body').html() || '';

    try {
      const result = await publishToWordPress({
        title: finalTitle,
        content: contentWithoutTitle,
        status: 'publish',
      });

      toast({
        title: 'Successfully Published!',
        description: (
          <a href={result.postUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Click here to view your new post.
          </a>
        ),
      });

    } catch (error) {
      console.error('Failed to publish to WordPress:', error);
      toast({
        variant: 'destructive',
        title: 'Publishing Failed',
        description: error instanceof Error ? error.message : 'Could not publish post to WordPress.'
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleExport = (format: string) => {
    toast({
      title: `Exporting to ${format}...`,
      description: 'This feature is not yet implemented.',
    });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }

  const handleNameSave = () => {
    updateNodeData({ name: name.trim() });
    setIsEditingName(false);
  }

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      setName(data.name || 'Untitled');
      setIsEditingName(false);
    }
  }


  const documentTitle = <EditableTitle name={name} isEditingName={isEditingName} onStartEdit={() => setIsEditingName(true)} onChange={handleNameChange} onBlur={handleNameSave} onKeyDown={handleNameKeyDown} />;
  const documentHeaderActions = (
    <div className="flex items-center gap-1">
      {docId && (
        <span className="text-[9px] bg-green-100 text-green-800 font-medium px-1.5 py-0.5 rounded-full">
          Saved
        </span>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 bg-background/50 hover:bg-muted text-muted-foreground rounded-full backdrop-blur-sm border border-border/20 transition-all"
              onClick={() => setIsExpandedOpen(true)}
            >
              <Maximize2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="rounded-xl text-[10px] px-2 py-1">
            <p>Expand Editor</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );

  return (
    <>
      <NodeShell
        id={id}
        nodeType="documentNode"
        selected={selected}
        onDelete={deleteNode}
        minWidth={380}
        minHeight={220}
        contentClassName="p-0 flex flex-col"
        title={documentTitle}
        icon={<FileText className="h-full w-full" />}
        headerActions={documentHeaderActions}
      >
        <NodeHandle type="target" position={Position.Left} nodeType="documentNode" isConnectable={isConnectable} />

        {/* Compact Toolbar */}
        <div className="nodrag px-3 pt-3 pb-1">
          <EditorToolbarCompact editor={editorInstance} />
        </div>

        {/* Editor Content */}
        <div className="flex-grow flex flex-col px-3 pb-3 overflow-hidden min-h-0">
          <ScrollArea className="flex-grow rounded-lg border bg-background/50 nodrag">
            <div className="p-3">
              <Editor
                content={content}
                onEditorReady={setEditorInstance}
                onChange={(newContent) => {
                  setContent(newContent);
                  updateNodeData({ content: newContent });
                  propagateToOutgoers(newContent);
                }}
              />
            </div>
          </ScrollArea>
        </div>

        {/* Bottom Action Bar */}
        <div className="flex gap-2 px-3 pb-3 nodrag">
          <Button onClick={handleSaveToDocs} variant="outline" size="sm" className="flex-1 h-8 text-xs rounded-full" disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Save className="mr-1 size-3" />}
            {docId ? 'Update' : 'Save'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs rounded-full">
                <Globe className="mr-1 size-3" /> Publish
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handlePublish('Web')}>Publish to Web</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePublish('WordPress')} disabled={isPublishing}>
                {isPublishing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Publish to WordPress
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs rounded-full">
                <Download className="mr-1 size-3" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport('PDF')}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('DOC')}>DOC</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <NodeHandle type="source" position={Position.Right} nodeType="documentNode" isConnectable={isConnectable} />
      </NodeShell>

      {/* Expanded Editor Dialog */}
      <Dialog open={isExpandedOpen} onOpenChange={setIsExpandedOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              {isEditingName ? (
                <Input
                  value={name}
                  onChange={handleNameChange}
                  onBlur={handleNameSave}
                  onKeyDown={handleNameKeyDown}
                  className="h-8 text-lg font-semibold w-64"
                  autoFocus
                />
              ) : (
                <span onClick={() => setIsEditingName(true)} className="cursor-pointer hover:text-primary transition-colors">
                  {name}
                  <Pencil className="inline-block ml-2 size-4 opacity-50" />
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Full Toolbar */}
          <div className="px-6 py-3 border-b shrink-0">
            <EditorToolbar editor={editorInstance} />
          </div>

          {/* Editor Content */}
          <ScrollArea className="flex-grow px-6 py-4">
            <Editor
              content={content}
              onEditorReady={setEditorInstance}
              onChange={(newContent) => {
                setContent(newContent);
                updateNodeData({ content: newContent });
                propagateToOutgoers(newContent);
              }}
            />
          </ScrollArea>

          {/* Dialog Actions */}
          <div className="flex gap-2 px-6 py-4 border-t shrink-0">
            <Button onClick={handleSaveToDocs} variant="outline" className="flex-1" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              {docId ? 'Update Doc' : 'Save to Docs'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1">
                  <Globe className="mr-2 size-4" /> Publish
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handlePublish('Web')}>Publish to Web</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePublish('WordPress')} disabled={isPublishing}>
                  Publish to WordPress
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1">
                  <Download className="mr-2 size-4" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport('PDF')}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('DOC')}>DOC</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default memo(DocumentNode);