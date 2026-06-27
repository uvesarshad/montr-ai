'use client';

import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import { Extension, Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import CharacterCount from '@tiptap/extension-character-count';
import Highlight from '@tiptap/extension-highlight';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Wand2,
  ChevronDown,
  Undo2,
  Redo2,
  Loader2,
  ImagePlus,
  Minus,
  Link as LinkIcon,
  Table as TableIcon,
  Palette,
  Highlighter,
  CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Separator } from './ui/separator';
import { createLowlight, all } from 'lowlight';
import React, { useState, useEffect, useRef } from 'react';
import { generateTextStream } from '@/ai/flows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Label } from './ui/label';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const lowlight = createLowlight(all);

const ToolbarButton = ({
  onClick,
  isActive,
  children,
  tooltip,
  disabled,
}: {
  onClick: (e: React.MouseEvent) => void;
  isActive?: boolean;
  children: React.ReactNode;
  tooltip: string;
  disabled?: boolean;
}) => (
  <Button
    variant="ghost"
    size="sm"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'size-8 p-0',
      isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
    )}
    title={tooltip}
  >
    {children}
  </Button>
);

type EditorVariant = 'default' | 'docs';

export const EditorToolbar = ({
  editor,
  variant = 'default',
}: {
  editor: ReturnType<typeof useEditor>;
  variant?: EditorVariant;
}) => {
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = React.useState(false);
  const [showImageModal, setShowImageModal] = React.useState(false);
  const [imageUrl, setImageUrl] = React.useState('');
  const [imageTab, setImageTab] = React.useState<'url' | 'upload'>('url');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const isDocsVariant = variant === 'docs';

  if (!editor) {
    return null;
  }

  const handleImageInsert = () => {
    if (imageUrl) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
      setImageUrl('');
      setShowImageModal(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        editor.chain().focus().setImage({ src: base64 }).run();
        setShowImageModal(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const colors = [
    '#000000', '#374151', '#ef4444', '#f97316', '#f59e0b',
    '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
    '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
  ];

  return (
    <div
      className={cn(
        'transition-all duration-200 ease-in-out',
        isDocsVariant
          ? 'w-full overflow-x-auto'
          : 'sticky top-20 z-10 mx-auto max-w-fit'
      )}
    >
      <div
        className={cn(
          'flex min-w-max items-center gap-1 border shadow-sm',
          isDocsVariant
            ? 'rounded-[12px] border-border/60 bg-background/85 p-2 backdrop-blur'
            : 'rounded-full bg-background/80 p-1 px-3 backdrop-blur-xl'
        )}
      >
        <div className="flex items-center">
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().undo().run(); }}
            tooltip="Undo"
            disabled={!editor.can().undo()}
          >
            <Undo2 className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().redo().run(); }}
            tooltip="Redo"
            disabled={!editor.can().redo()}
          >
            <Redo2 className="size-4" />
          </ToolbarButton>
        </div>

        <Separator orientation="vertical" className="mx-1 h-4" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 gap-1 font-normal text-muted-foreground hover:text-foreground',
                isDocsVariant && 'rounded-[0.4rem] px-2.5'
              )}
            >
              {editor.isActive('heading', { level: 1 }) ? 'Heading 1' :
                editor.isActive('heading', { level: 2 }) ? 'Heading 2' :
                  editor.isActive('heading', { level: 3 }) ? 'Heading 3' :
                    editor.isActive('heading', { level: 4 }) ? 'Heading 4' :
                      editor.isActive('heading', { level: 5 }) ? 'Heading 5' :
                        editor.isActive('heading', { level: 6 }) ? 'Heading 6' :
                          'Paragraph'}
              <ChevronDown className="size-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
              Paragraph
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              Heading 1
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              Heading 2
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              Heading 3
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
              Heading 4
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 5 }).run()}>
              Heading 5
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 6 }).run()}>
              Heading 6
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <div className="flex items-center">
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
            isActive={editor.isActive('bold')}
            tooltip="Bold"
          >
            <Bold className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
            isActive={editor.isActive('italic')}
            tooltip="Italic"
          >
            <Italic className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
            isActive={editor.isActive('underline')}
            tooltip="Underline"
          >
            <UnderlineIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }}
            isActive={editor.isActive('strike')}
            tooltip="Strikethrough"
          >
            <Strikethrough className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleCodeBlock().run(); }}
            isActive={editor.isActive('codeBlock')}
            tooltip="Code Block"
          >
            <Code className="size-4" />
          </ToolbarButton>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <div className="flex items-center">
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
            isActive={editor.isActive('bulletList')}
            tooltip="Bullet List"
          >
            <List className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
            isActive={editor.isActive('orderedList')}
            tooltip="Ordered List"
          >
            <ListOrdered className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBlockquote().run(); }}
            isActive={editor.isActive('blockquote')}
            tooltip="Blockquote"
          >
            <Quote className="size-4" />
          </ToolbarButton>
        </div>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <ToolbarButton
          onClick={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('left').run(); }}
          isActive={editor.isActive({ textAlign: 'left' })}
          tooltip="Align Left"
        >
          <AlignLeft className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('center').run(); }}
          isActive={editor.isActive({ textAlign: 'center' })}
          tooltip="Align Center"
        >
          <AlignCenter className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('right').run(); }}
          isActive={editor.isActive({ textAlign: 'right' })}
          tooltip="Align Right"
        >
          <AlignRight className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('justify').run(); }}
          isActive={editor.isActive({ textAlign: 'justify' })}
          tooltip="Align Justify"
        >
          <AlignJustify className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <ToolbarButton
          onClick={setLink}
          isActive={editor.isActive('link')}
          tooltip="Add Link"
        >
          <LinkIcon className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 h-8 font-normal text-muted-foreground hover:text-foreground px-2">
              <TableIcon className="size-3.5" />
              <ChevronDown className="size-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={insertTable}>
              <TableIcon className="size-4 mr-2" />
              Insert Table
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              disabled={!editor.can().toggleHeaderRow()}
            >
              Toggle Header Row
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
              disabled={!editor.can().toggleHeaderColumn()}
            >
              Toggle Header Column
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().toggleHeaderCell().run()}
              disabled={!editor.can().toggleHeaderCell()}
            >
              Toggle Header Cell
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().mergeCells().run()}
              disabled={!editor.can().mergeCells()}
            >
              Merge Cells
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().splitCell().run()}
              disabled={!editor.can().splitCell()}
            >
              Split Cell
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().mergeOrSplit().run()}
              disabled={!editor.can().mergeOrSplit()}
            >
              Merge or Split Selection
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().goToNextCell().run()}
              disabled={!editor.can().goToNextCell()}
            >
              Go To Next Cell
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().goToPreviousCell().run()}
              disabled={!editor.can().goToPreviousCell()}
            >
              Go To Previous Cell
            </DropdownMenuItem>
            <Separator className="my-1" />
            <DropdownMenuItem onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!editor.can().addColumnBefore()}>
              Add Column Before
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.can().addColumnAfter()}>
              Add Column After
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!editor.can().deleteColumn()}>
              Delete Column
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!editor.can().addRowBefore()}>
              Add Row Before
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.can().addRowAfter()}>
              Add Row After
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()} disabled={!editor.can().deleteRow()}>
              Delete Row
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.can().deleteTable()}>
              Delete Table
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <DropdownMenu open={showColorPicker} onOpenChange={setShowColorPicker}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="size-8 p-0" title="Text Color">
              <Palette className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="grid grid-cols-5 gap-1 p-2">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="size-7 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    editor.chain().focus().setColor(color).run();
                    setShowColorPicker(false);
                  }}
                />
              ))}
            </div>
            <DropdownMenuItem onClick={() => {
              editor.chain().focus().unsetColor().run();
              setShowColorPicker(false);
            }}>
              Reset Color
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu open={showHighlightPicker} onOpenChange={setShowHighlightPicker}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="size-8 p-0" title="Highlight">
              <Highlighter className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="grid grid-cols-5 gap-1 p-2">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="size-7 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    editor.chain().focus().setHighlight({ color }).run();
                    setShowHighlightPicker(false);
                  }}
                />
              ))}
            </div>
            <DropdownMenuItem onClick={() => {
              editor.chain().focus().unsetHighlight().run();
              setShowHighlightPicker(false);
            }}>
              Remove Highlight
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <ToolbarButton
          onClick={(e) => { e.preventDefault(); editor.chain().focus().setHorizontalRule().run(); }}
          isActive={false}
          tooltip="Horizontal Line"
        >
          <Minus className="size-4" />
        </ToolbarButton>

        <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0 text-muted-foreground"
              title="Insert Image"
            >
              <ImagePlus className="size-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Insert Image</DialogTitle>
              <DialogDescription>
                Add an image from URL or upload from your computer.
              </DialogDescription>
            </DialogHeader>
            <Tabs value={imageTab} onValueChange={(v) => setImageTab(v as 'url' | 'upload')} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url">From URL</TabsTrigger>
                <TabsTrigger value="upload">Upload</TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="image-url">Image URL</Label>
                  <Input
                    id="image-url"
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={handleImageInsert} disabled={!imageUrl}>
                    Insert
                  </Button>
                </DialogFooter>
              </TabsContent>
              <TabsContent value="upload" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="image-file">Choose Image</Label>
                  <Input
                    id="image-file"
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="cursor-pointer"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Supported formats: JPG, PNG, GIF, WebP
                </p>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        <ToolbarButton
          onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleTaskList().run(); }}
          isActive={editor.isActive('taskList')}
          tooltip="Task List"
        >
          <CheckSquare className="size-4" />
        </ToolbarButton>

      </div>
    </div>
  );
};

// Compact toolbar for canvas Document node - 6 essential tools + More dropdown
export const EditorToolbarCompact = ({ editor }: { editor: ReturnType<typeof useEditor> }) => {
  const [_imageUrl, _setImageUrl] = React.useState('');

  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="flex items-center gap-0.5 rounded-full border bg-background/80 backdrop-blur-xl p-0.5 shadow-sm px-2">
      {/* Heading Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-0.5 h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground">
            {editor.isActive('heading', { level: 1 }) ? 'H1' :
              editor.isActive('heading', { level: 2 }) ? 'H2' :
                editor.isActive('heading', { level: 3 }) ? 'H3' : 'P'}
            <ChevronDown className="size-2.5 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>Paragraph</DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>Heading 1</DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>Heading 2</DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>Heading 3</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-3 mx-0.5" />

      {/* Core formatting: Bold, Italic, Underline */}
      <ToolbarButton onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} isActive={editor.isActive('bold')} tooltip="Bold">
        <Bold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} isActive={editor.isActive('italic')} tooltip="Italic">
        <Italic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }} isActive={editor.isActive('underline')} tooltip="Underline">
        <UnderlineIcon className="size-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-3 mx-0.5" />

      {/* Bullet List */}
      <ToolbarButton onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }} isActive={editor.isActive('bulletList')} tooltip="Bullet List">
        <List className="size-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-3 mx-0.5" />

      {/* More dropdown for additional tools */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="size-7 p-0 text-muted-foreground hover:text-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="size-4 mr-2" /> Strikethrough
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="size-4 mr-2" /> Ordered List
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote className="size-4 mr-2" /> Blockquote
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
            <Code className="size-4 mr-2" /> Code Block
          </DropdownMenuItem>
          <DropdownMenuItem onClick={setLink}>
            <LinkIcon className="size-4 mr-2" /> Add Link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={insertTable}>
            <TableIcon className="size-4 mr-2" /> Insert Table
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus className="size-4 mr-2" /> Horizontal Line
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleTaskList().run()}>
            <CheckSquare className="size-4 mr-2" /> Task List
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

// Create the highlight plugin key
const highlightPluginKey = new PluginKey('aiHighlight');

// Wrap the plugin in an Extension
const AIHighlightExtension = Extension.create({
  name: 'aiHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: highlightPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            set = set.map(tr.mapping, tr.doc);
            const action = tr.getMeta(highlightPluginKey);
            if (action && action.add) {
              const { from, to } = action.add;
              const decoration = Decoration.inline(from, to, {
                class: 'ai-selection-highlight',
              });
              set = set.add(tr.doc, [decoration]);
            } else if (action && action.remove) {
              set = DecorationSet.empty;
            }
            return set;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

export const Editor = ({
  content,
  onChange,
  onEditorReady,
  extensions = [],
  variant = 'default',
}: {
  content: string;
  onChange: (newContent: string) => void;
  onEditorReady: (editor: ReturnType<typeof useEditor>) => void;
  extensions?: Extensions;
  variant?: EditorVariant;
}) => {
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const savedSelection = useRef<{ from: number; to: number; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDocsVariant = variant === 'docs';

  const editor = useEditor({
    extensions: [
      ...extensions,
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        codeBlock: false,
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return `Heading ${node.attrs.level}`;
          }
          return 'Start writing here, use \'/\' for commands, or select text to use AI.';
        },
      }),
      Underline,
      Subscript,
      Superscript,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TextStyle,
      Color,
      CharacterCount,
      Highlight.configure({ multicolor: true }),
      AIHighlightExtension, // Add the wrapped extension
    ],
    content: content,
    editorProps: {
      attributes: {
        class: cn(
          'prose max-w-none focus:outline-none',
          isDocsVariant
            ? 'prose-slate dark:prose-invert min-h-[calc(100vh-24rem)] px-0 text-[15px] leading-8'
            : 'prose-stone dark:prose-invert prose-lg min-h-[calc(100vh-20rem)] px-2'
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onCreate: ({ editor }) => {
      onEditorReady(editor);
    }
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  const handleAiAction = async (prompt: string, context: string) => {
    if (!editor || isAiRunning || !savedSelection.current) return;
    setIsAiRunning(true);

    const { from, to } = savedSelection.current;

    // Remove highlight and delete selected text
    editor.view.dispatch(editor.view.state.tr.setMeta(highlightPluginKey, { remove: true }));
    editor.chain().focus().deleteRange({ from, to }).run();

    try {
      const stream = await generateTextStream({
        prompt,
        context,
        model: 'gemini-2.5-flash'
      });

      for await (const chunk of stream) {
        if (chunk && editor && !editor.isDestroyed) {
          try {
            const currentPos = editor.state.selection.to;
            editor.chain().focus().insertContentAt(currentPos, chunk).run();

            await new Promise(resolve => setTimeout(resolve, 100));

          } catch {
            const currentPos = editor.state.selection.to;
            const plainText = chunk.replace(/<[^>]*>/g, '');
            editor.chain().focus().insertContentAt(currentPos, plainText).run();

            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

    } catch (error) {
      console.error('AI action failed:', error);
      alert(`AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAiRunning(false);
      savedSelection.current = null;
    }
  };

  const getSelectedText = () => {
    if (!savedSelection.current) return '';
    return savedSelection.current.text;
  };

  if (!editor) return null;

  return (
    <>
      <style jsx global>{`
        .ai-selection-highlight {
          background-color: rgba(59, 130, 246, 0.3);
          border-radius: 2px;
        }
        
        .dark .ai-selection-highlight {
          background-color: rgba(96, 165, 250, 0.3);
        }

        .prose blockquote {
          border-left: 4px solid #e5e7eb;
          padding-left: 1.25rem;
          font-style: italic;
          color: #4b5563;
          margin: 1.5rem 0;
        }

        .dark .prose blockquote {
          border-left-color: #374151;
          color: #9ca3af;
        }

        .prose hr {
            border: 0;
            border-top: 2px solid #e5e7eb;
            margin: 2rem 0;
        }

        .dark .prose hr {
            border-top-color: #374151;
        }

        ul[data-type="taskList"] {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 0px;
          padding: 0;
        }

        ul[data-type="taskList"] li > label {
          flex: 0 0 auto;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 1.75em; /* Match the line-height of the text */
        }

        ul[data-type="taskList"] input[type="checkbox"] {
          appearance: none;
          background-color: transparent;
          margin: 0;
          font: inherit;
          color: currentColor;
          width: 1.1rem;
          height: 1.1rem;
          border: 1.5px solid #d1d5db;
          border-radius: 4px;
          display: grid;
          place-content: center;
          cursor: pointer;
          transition: all 0.1s ease-in-out;
        }

        .dark ul[data-type="taskList"] input[type="checkbox"] {
          border-color: #4b5563;
        }

        ul[data-type="taskList"] input[type="checkbox"]::before {
          content: "";
          width: 0.6rem;
          height: 0.6rem;
          transform: scale(0);
          transition: 120ms transform ease-in-out;
          background-color: white;
          clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
        }

        ul[data-type="taskList"] input[type="checkbox"]:checked {
          background-color: #3b82f6;
          border-color: #3b82f6;
        }

        ul[data-type="taskList"] input[type="checkbox"]:checked::before {
          transform: scale(1);
        }

        ul[data-type="taskList"] li[data-checked="true"] p {
          text-decoration: line-through;
          color: #9ca3af;
        }

        ul[data-type="taskList"] li > div {
          flex: 1 1 auto;
          min-width: 0;
        }

        ul[data-type="taskList"] li p {
          margin: 0;
          line-height: 1.75;
        }

        .prose table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
          margin: 1.5rem 0;
          overflow: hidden;
        }

        .prose th,
        .prose td {
          min-width: 1em;
          border: 2px solid #e5e7eb;
          padding: 0.5rem 0.75rem;
          vertical-align: top;
          box-sizing: border-box;
          position: relative;
        }

        .dark .prose th,
        .dark .prose td {
          border-color: #374151;
        }

        .prose th {
          font-weight: bold;
          text-align: left;
          background-color: #f9fafb;
        }

        .dark .prose th {
          background-color: #1f2937;
        }

        .prose .selectedCell:after {
          z-index: 2;
          position: absolute;
          content: "";
          left: 0;
          right: 0;
          top: 0;
          bottom: 0;
          background: rgba(200, 200, 255, 0.4);
          pointer-events: none;
        }

        .prose a {
          color: hsl(var(--primary));
          text-decoration: underline;
          cursor: pointer;
        }

        .prose a:hover {
          opacity: 0.8;
        }

        .docs-editor-content .ProseMirror {
          caret-color: hsl(var(--primary));
        }

        .docs-editor-content .ProseMirror > *:first-child {
          margin-top: 0;
        }

        .docs-editor-content .ProseMirror h1,
        .docs-editor-content .ProseMirror h2,
        .docs-editor-content .ProseMirror h3 {
          letter-spacing: -0.03em;
          color: hsl(var(--foreground));
        }

        .docs-editor-content .ProseMirror h1 {
          font-size: 2.15rem;
          line-height: 1.1;
          margin-top: 2.25rem;
          margin-bottom: 1rem;
        }

        .docs-editor-content .ProseMirror h2 {
          font-size: 1.6rem;
          line-height: 1.2;
          margin-top: 2rem;
          margin-bottom: 0.85rem;
        }

        .docs-editor-content .ProseMirror h3 {
          font-size: 1.25rem;
          line-height: 1.3;
          margin-top: 1.75rem;
          margin-bottom: 0.75rem;
        }

        .docs-editor-content .ProseMirror p.is-editor-empty:first-child::before {
          color: hsl(var(--muted-foreground));
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }

        .docs-editor-content .ProseMirror code {
          border-radius: 0.45rem;
          background: color-mix(in oklab, hsl(var(--muted)) 78%, transparent);
          padding: 0.16rem 0.42rem;
          font-size: 0.9em;
        }

        .docs-editor-content .ProseMirror pre {
          border: 1px solid hsl(var(--border));
          border-radius: 1rem;
          padding: 1rem 1.1rem;
          background: color-mix(in oklab, hsl(var(--muted)) 78%, transparent);
        }

        .docs-editor-content .ProseMirror img {
          border: 1px solid hsl(var(--border));
          border-radius: 1rem;
          overflow: hidden;
        }

        .docs-editor-content .ProseMirror ul,
        .docs-editor-content .ProseMirror ol {
          padding-left: 1.2rem;
        }
      `}</style>

      <BubbleMenu
        className={cn(
          'flex w-96 flex-col items-stretch gap-1 rounded-lg border bg-background p-2 shadow-lg',
          isDocsVariant && 'border-border/60 bg-background/95 backdrop-blur'
        )}
        editor={editor}
        tippyOptions={{
          duration: 100,
          onShow: () => {
            const { from, to } = editor.view.state.selection;
            const text = editor.state.doc.textBetween(from, to, ' ');
            savedSelection.current = { from, to, text };

            // Add highlight decoration
            editor.view.dispatch(
              editor.view.state.tr.setMeta(highlightPluginKey, { add: { from, to } })
            );
          },
          onHide: () => {
            savedSelection.current = null;
            setCustomPrompt('');

            // Remove highlight decoration
            if (editor && !editor.isDestroyed) {
              editor.view.dispatch(
                editor.view.state.tr.setMeta(highlightPluginKey, { remove: true })
              );
            }
          }
        }}
        shouldShow={({ editor: _editor, view: _view, state: _state, from, to }) => {
          if (isAiRunning) {
            return false;
          }
          return from !== to;
        }}
      >
        <div className="flex items-center gap-1" onMouseDown={(e) => e.preventDefault()}>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 h-8 font-normal text-muted-foreground hover:text-foreground px-2">
                {editor.isActive('heading', { level: 1 }) ? 'H1' :
                  editor.isActive('heading', { level: 2 }) ? 'H2' :
                    editor.isActive('heading', { level: 3 }) ? 'H3' :
                      editor.isActive('heading', { level: 4 }) ? 'H4' :
                        editor.isActive('heading', { level: 5 }) ? 'H5' :
                          editor.isActive('heading', { level: 6 }) ? 'H6' :
                            'P'}
                <ChevronDown className="size-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onMouseDown={(e) => e.preventDefault()}
              className="z-[9999]"
              onCloseAutoFocus={(e) => e.preventDefault()}
              portal={false}
            >
              <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
                Paragraph
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                Heading 1
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                Heading 2
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                Heading 3
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
                Heading 4
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 5 }).run()}>
                Heading 5
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 6 }).run()}>
                Heading 6
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-4 mx-1" />

          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
            isActive={editor.isActive('bold')}
            tooltip="Bold"
          >
            <Bold className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
            isActive={editor.isActive('italic')}
            tooltip="Italic"
          >
            <Italic className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
            isActive={editor.isActive('bulletList')}
            tooltip="Bullet List"
          >
            <List className="size-4" />
          </ToolbarButton>
          <Separator orientation='vertical' className='h-6 mx-1' />
          <ToolbarButton
            onClick={() => handleAiAction('Rewrite the following text to be more clear and concise:', getSelectedText())}
            isActive={false}
            tooltip="Rewrite"
            disabled={isAiRunning || !getSelectedText()}
          >
            {isAiRunning ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          </ToolbarButton>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground whitespace-nowrap"
                disabled={isAiRunning || !getSelectedText()}
                onMouseDown={(e) => e.preventDefault()}
              >
                Change Tone
                <ChevronDown className="size-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onMouseDown={(e) => e.preventDefault()}
              className="z-[9999]"
              avoidCollisions={true}
              onCloseAutoFocus={(e) => e.preventDefault()}
              portal={false}
            >
              <DropdownMenuItem
                onClick={() => handleAiAction('Rewrite this text in a professional tone:', getSelectedText())}
                onSelect={(e) => e.preventDefault()}
              >
                Professional
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAiAction('Rewrite this text in a casual and friendly tone:', getSelectedText())}
                onSelect={(e) => e.preventDefault()}
              >
                Casual
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAiAction('Rewrite this text in a confident and assertive tone:', getSelectedText())}
                onSelect={(e) => e.preventDefault()}
              >
                Confident
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Input
            ref={inputRef}
            placeholder="Ask AI to..."
            className="h-8 flex-1"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAiAction(customPrompt, getSelectedText());
                setCustomPrompt('');
              }
            }}
          />
          <Button
            size="sm"
            className="h-8"
            onClick={() => {
              handleAiAction(customPrompt, getSelectedText());
              setCustomPrompt('');
            }}
            disabled={isAiRunning || !customPrompt}
          >
            {isAiRunning ? <Loader2 className="size-4 animate-spin" /> : "Ask"}
          </Button>
        </div>
      </BubbleMenu>
      <EditorContent
        editor={editor}
        className={cn(
          isDocsVariant && 'docs-editor-content'
        )}
      />
    </>
  );
};
