
'use client';

import { Skeleton, Button, Chip, IconButton } from '@/components/ui-kit';
import { useDocument, useDocs, useFolder } from '@/hooks/use-docs-v2';
import { useForm } from '@/hooks/use-forms';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import React, { useEffect, useState, useCallback } from 'react';
import { Editor, EditorToolbar } from '@/components/editor';
import { useEditor } from '@tiptap/react';
import { useDebouncedCallback } from 'use-debounce';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { Calendar, Clock, Clock3, FileText, Check, Loader2, Globe, Link2, Eye, EyeOff, Printer, PanelLeftClose, PanelLeftOpen, FolderOpen, Plus, BookText, ExternalLink, Sparkles } from 'lucide-react';
import { useAppHeader } from '@/components/app-header';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/lib/auth-client';
import { FormEmbedNode } from '@/components/docs/form-embed';
import { DocVersionHistory } from '@/components/docs/doc-version-history';
import { SlashCommand } from '@/components/docs/slash-command';
import { NotionBrowser } from '@/components/integrations/notion-browser';
import { NotionSyncControl } from '@/components/docs/notion-sync-control';
import { WordpressPublishControl } from '@/components/docs/wordpress-publish-control';
import { NotionLogo } from '@/components/social-icons';
import { cn } from '@/lib/utils';
import { buildLinkedFormEmbedSection } from '@/lib/forms/linked-form-content';
import { ResourceLinkDialog, type ResourceLinkItem } from '@/components/link-resource-dialog';
import { getSortedLinkableResources } from '@/lib/links/resource-linking';
import { openAgentLauncher } from '@/lib/agent/launcher';

interface LinkableFormRecord extends ResourceLinkItem {
  isPublished?: boolean;
  slug?: string;
}

function SaveIndicator({ saveStatus, updatedAt }: { saveStatus: 'idle' | 'saving' | 'saved'; updatedAt?: string | Date }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-[140px] justify-end">
      <AnimatePresence mode="wait">
        {saveStatus === 'saving' ? (
          <motion.div
            key="saving"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2"
          >
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span className="text-xs">Saving...</span>
          </motion.div>
        ) : saveStatus === 'saved' ? (
          <motion.div
            key="saved"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2"
          >
            <Check className="size-3.5 text-green-500" />
            <span className="text-xs">Saved</span>
          </motion.div>
        ) : (
          <motion.span
            key="last-saved"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs"
          >
            Last saved: {updatedAt ? format(new Date(updatedAt), 'p') : 'Saved'}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DocPage() {
  const params = useParams();
  const id = params.id as string;
  const { push: routerPush } = useRouter();
  const { data: session } = useSession();
  const { toast } = useToast();
  const { setHeaderInfo } = useAppHeader();

  const [title, setTitle] = useState('');
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [readingTime, setReadingTime] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [editor, setEditor] = useState<ReturnType<typeof useEditor>>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLinkingForm, setIsLinkingForm] = useState(false);
  const [isFormLinkDialogOpen, setIsFormLinkDialogOpen] = useState(false);
  const [availableForms, setAvailableForms] = useState<ResourceLinkItem[]>([]);
  const [isFormsLoading, setIsFormsLoading] = useState(false);
  const [isNotesSidebarCollapsed, setIsNotesSidebarCollapsed] = useState(false);
  const [lastVersionContent, setLastVersionContent] = useState<string>('');
  const autoSaveIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Use MongoDB hook
  const { document, isLoading, error: docError, updateDocument, refetch } = useDocument(id);
  const { folder: currentFolder } = useFolder(document?.folderId ?? null);
  const linkedFormId = document?.referenceType === 'form' ? document.referenceId ?? '' : '';
  const { form: linkedForm } = useForm(linkedFormId);
  const {
    documents: sidebarDocuments,
    isLoading: isSidebarLoading,
    createDocument: createSiblingDocument,
  } = useDocs({ folderId: document?.folderId ?? null, sortBy: 'updatedAt' });

  useEffect(() => {
    if (document) {
      setTitle(document.title);
      if (initialContent === null) {
        setInitialContent(document.content);
        setLastVersionContent(document.content);
      }
      const plainText = document.content.replace(/<[^>]+>/g, '');
      const words = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
      setWordCount(words);
      setReadingTime(Math.ceil(words / 200));
    }
  }, [document, initialContent]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedState = window.localStorage.getItem('docs-note-sidebar-collapsed');
    if (savedState) {
      setIsNotesSidebarCollapsed(savedState === 'true');
    }
  }, []);

  const toggleNotesSidebar = useCallback(() => {
    setIsNotesSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('docs-note-sidebar-collapsed', String(next));
      }
      return next;
    });
  }, []);

  // Auto-save version snapshots every 30 seconds
  useEffect(() => {
    if (!document) return;

    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
    }

    autoSaveIntervalRef.current = setInterval(async () => {
      // Only create version if content has changed significantly from last snapshot
      // We rely on document.content being updated by the useDocument hook after saves
      if (lastVersionContent && document.content && lastVersionContent !== document.content) {
        try {
          await fetch(`/api/docs/${id}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isAutoSave: true }),
          });
          setLastVersionContent(document.content);
        } catch (error) {
          console.error('Auto-save version failed:', error);
        }
      }
    }, 30000); // 30 seconds

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [document, lastVersionContent, id]);

  const handlePublishToggle = useCallback(async () => {
    if (!document || !session) return;
    setIsPublishing(true);

    try {
      const isCurrentlyPublished = document.isPublished;
      const updateData: Record<string, unknown> = {
        isPublished: !isCurrentlyPublished,
      };

      if (!isCurrentlyPublished) {
        // Publishing - create URL with username and title slug
        const username = session.user?.username || session.user?.id?.substring(0, 8);
        const titleSlug = document.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .substring(0, 20);

        updateData.publishedUsername = username;
        updateData.publishedUrl = `${window.location.origin}/p/${username}/${titleSlug}-${id}`;
      }

      await updateDocument(updateData);

      toast({
        title: !isCurrentlyPublished ? 'Document Published!' : 'Document Unpublished',
        description: !isCurrentlyPublished
          ? 'Your document is now publicly accessible.'
          : 'Your document is now private.',
      });
    } catch (error: unknown) {
      console.error('Publish toggle failed:', error);
      toast({
        variant: 'destructive',
        title: 'Action Failed',
        description: error instanceof Error ? error.message : 'Could not update publish status.',
      });
    } finally {
      setIsPublishing(false);
    }
  }, [document, id, session, toast, updateDocument]);

  const handleCopyPublicUrl = useCallback(() => {
    if (document?.publishedUrl) {
      navigator.clipboard.writeText(document.publishedUrl);
      toast({
        title: 'URL Copied!',
        description: 'Public URL copied to clipboard.',
      });
    }
  }, [document?.publishedUrl, toast]);

  const handleCreateSiblingDoc = useCallback(async () => {
    try {
      const newDoc = await createSiblingDocument('Untitled Document');
      routerPush(`/docs/${newDoc._id}`);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Creation failed',
        description: 'Could not create a new note.',
      });
    }
  }, [createSiblingDocument, routerPush, toast]);

  const appendFormEmbedsIfNeeded = useCallback((currentContent: string, formId: string, formTitle: string) => {
    if (currentContent.includes(`formId="${formId}"`)) {
      return currentContent;
    }

    const embedSection = buildLinkedFormEmbedSection({
      formId,
      formTitle,
    });

    return `${currentContent}${currentContent ? '<p></p>' : ''}${embedSection}`;
  }, []);

  const loadAvailableForms = useCallback(async () => {
    setIsFormsLoading(true);

    try {
      const response = await fetch('/api/v2/forms');
      if (!response.ok) {
        throw new Error('Failed to load forms');
      }

      const forms = await response.json();
      const items = getSortedLinkableResources(
        (forms || []).map((form: LinkableFormRecord & { updatedAt?: string }) => ({
          _id: form._id,
          title: form.title || 'Untitled Form',
          subtitle: form.updatedAt
            ? `Updated ${formatDistanceToNow(new Date(form.updatedAt), { addSuffix: true })}`
            : form.isPublished
              ? 'Published form'
              : 'Draft form',
          updatedAt: form.updatedAt,
          isPublished: form.isPublished,
          slug: form.slug,
        }))
      );

      setAvailableForms(items);
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Forms unavailable',
        description: 'Could not load existing forms right now.',
      });
    } finally {
      setIsFormsLoading(false);
    }
  }, [toast]);

  const handleLinkExistingForm = useCallback(async (selectedForm: ResourceLinkItem) => {
    if (!document) {
      return;
    }

    setIsLinkingForm(true);

    try {
      const formTitle = selectedForm.title || title?.trim() || document.title || 'Untitled Form';
      const currentContent = editor?.getHTML?.() || document.content;
      const nextContent = appendFormEmbedsIfNeeded(currentContent, selectedForm._id, formTitle);

      await updateDocument({
        referenceId: selectedForm._id,
        referenceType: 'form',
        content: nextContent,
      });
      setInitialContent(nextContent);
      setLastVersionContent(nextContent);

      setIsFormLinkDialogOpen(false);
      toast({
        title: 'Form linked',
        description: `${selectedForm.title} is now connected to this note.`,
      });
    } catch (error: unknown) {
      console.error('Link existing form failed:', error);
      toast({
        variant: 'destructive',
        title: 'Link failed',
        description: error instanceof Error ? error.message : 'Could not connect the selected form to this note.',
      });
    } finally {
      setIsLinkingForm(false);
    }
  }, [appendFormEmbedsIfNeeded, document, editor, title, toast, updateDocument]);

  const handleCreateLinkedForm = useCallback(async () => {
    if (!document) {
      return;
    }

    setIsLinkingForm(true);

    try {
      const createResponse = await fetch('/api/v2/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create linked form');
      }

      const newForm = await createResponse.json();
      const formTitle = title?.trim() || document.title || 'Untitled Form';

      const updateFormResponse = await fetch(`/api/v2/forms/${newForm._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formTitle }),
      });

      if (!updateFormResponse.ok) {
        throw new Error('Failed to prepare linked form');
      }

      const currentContent = editor?.getHTML?.() || document.content;
      const nextContent = appendFormEmbedsIfNeeded(currentContent, newForm._id, formTitle);

      await updateDocument({
        referenceId: newForm._id,
        referenceType: 'form',
        content: nextContent,
      });
      setInitialContent(nextContent);
      setLastVersionContent(nextContent);

      setIsFormLinkDialogOpen(false);
      routerPush(`/forms/${newForm._id}`);
    } catch (error: unknown) {
      console.error('Linked form action failed:', error);
      toast({
        variant: 'destructive',
        title: 'Linked form unavailable',
        description: error instanceof Error ? error.message : 'Could not create the linked form for this note.',
      });
    } finally {
      setIsLinkingForm(false);
    }
  }, [appendFormEmbedsIfNeeded, document, editor, routerPush, title, toast, updateDocument]);

  const handleOpenLinkedForm = useCallback(async () => {
    if (!document) {
      return;
    }

    if (document.referenceType === 'form' && document.referenceId) {
      routerPush(`/forms/${document.referenceId}`);
      return;
    }

    setIsFormLinkDialogOpen(true);
    if (!availableForms.length) {
      await loadAvailableForms();
    }
  }, [availableForms.length, document, loadAvailableForms, routerPush]);

  const handleImportFromNotion = useCallback(async (pageId: string, title: string, brandId: string) => {
    if (!editor) return;

    try {
      toast({ title: 'Importing from Notion...', description: `Fetching content for "${title}"` });
      const response = await fetch(`/api/social/notion/pages/${pageId}?brandId=${brandId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import page');
      }
      const data = await response.json();

      // Insert content into editor
      editor.chain().focus().insertContent(data.markdown).run();

      toast({ title: 'Import successful', description: `Content from "${title}" imported.` });
    } catch (error: unknown) {
      console.error('Notion import error:', error);
      toast({
        variant: 'destructive',
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [editor, toast]);

  // After a Notion pull rewrites Document.content server-side, reload the
  // fresh content into the live editor (and version baselines).
  const handleNotionPulled = useCallback(async () => {
    try {
      const response = await fetch(`/api/v2/documents/${id}`, { credentials: 'include' });
      if (!response.ok) return;
      const fresh = await response.json();
      if (editor && typeof fresh.content === 'string') {
        editor.commands.setContent(fresh.content);
        setInitialContent(fresh.content);
        setLastVersionContent(fresh.content);
      }
      if (fresh.title) setTitle(fresh.title);
      refetch();
    } catch (error) {
      console.error('Failed to refresh after Notion pull:', error);
    }
  }, [editor, id, refetch]);

  const handleAskAgent = useCallback(() => {
    if (!document) {
      return;
    }

    openAgentLauncher({
      prompt: 'Review this document and turn it into a mission with suggested improvements, follow-up tasks, and any reusable outputs I should create next.',
      context: {
        source: 'docs_document',
        entityType: 'document',
        entityId: id,
        entityLabel: document.title || title || 'Untitled document',
        route: `/docs/${id}`,
        notes: [
          currentFolder?.name ? `Folder: ${currentFolder.name}` : 'At workspace root',
          `Word count: ${wordCount}`,
          `Reading time: ${readingTime} min`,
          document.referenceType === 'form'
            ? linkedForm?.title ? `Linked form: ${linkedForm.title}` : 'Linked to a form'
            : 'No linked form',
        ],
      },
    });
  }, [currentFolder?.name, document, id, linkedForm?.title, readingTime, title, wordCount]);

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'Edit Doc',
      backHref: '/docs',
      actions: (
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleAskAgent} className="gap-2 text-muted-foreground hover:text-foreground">
            <Sparkles className="size-4" />
            <span className="hidden sm:inline">Ask Agent</span>
          </Button>
          <NotionBrowser onSelectPage={handleImportFromNotion}>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <NotionLogo className="size-4" />
              <span className="hidden sm:inline">Import from Notion</span>
            </Button>
          </NotionBrowser>
          <NotionSyncControl docId={id} onContentPulled={handleNotionPulled} />
          <WordpressPublishControl docId={id} />
          <DocVersionHistory docId={id} />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenLinkedForm}
            className="gap-2 text-muted-foreground hover:text-foreground"
            disabled={isLinkingForm}
          >
            {isLinkingForm ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <BookText className="size-4" />
            )}
            <span className="hidden sm:inline">
              {document?.referenceType === 'form' ? 'Linked Form' : 'Link Form'}
            </span>
          </Button>
          {document?.isPublished && document?.publishedUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyPublicUrl}
              className="gap-2"
            >
              <Link2 className="size-4" />
              Copy URL
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={document?.isPublished ? "primary" : "outline"}
                size="sm"
                disabled={isPublishing}
                className="gap-2"
              >
                {isPublishing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : document?.isPublished ? (
                  <Eye className="size-4" />
                ) : (
                  <EyeOff className="size-4" />
                )}
                {document?.isPublished ? 'Published' : 'Publish'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handlePublishToggle}>
                {document?.isPublished ? (
                  <>
                    <EyeOff className="mr-2 size-4" />
                    Unpublish
                  </>
                ) : (
                  <>
                    <Globe className="mr-2 size-4" />
                    Publish to Web
                  </>
                )}
              </DropdownMenuItem>
              {document?.isPublished && document?.publishedUrl && (
                <DropdownMenuItem onClick={() => window.open(document.publishedUrl, '_blank')}>
                  <Eye className="mr-2 size-4" />
                  View Public Page
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => window.print()}>
                <Printer className="mr-2 size-4" />
                Print / Save as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    });
    return () => setHeaderInfo(null);
  }, [
    setHeaderInfo,
    document?.isPublished,
    document?.publishedUrl,
    document?.referenceType,
    handleAskAgent,
    handleCopyPublicUrl,
    handleImportFromNotion,
    handleNotionPulled,
    handleOpenLinkedForm,
    handlePublishToggle,
    id,
    isLinkingForm,
    isPublishing,
    title,
  ]);

  const handleContentSave = useDebouncedCallback(async (newContent: string) => {
    if (!document) return;

    const plainText = newContent.replace(/<[^>]+>/g, '');
    const words = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setReadingTime(Math.ceil(words / 200));
    setSaveStatus('saving');

    try {
      await updateDocument({ content: newContent });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e: unknown) {
      console.error("Auto-save failed", e);
      setSaveStatus('idle');
      toast({
        variant: "destructive",
        title: "Save failed",
        description: "Could not automatically save your changes."
      })
    }

  }, 3000);

  const handleTitleSave = useDebouncedCallback(async (newTitle: string) => {
    if (!document) return;
    setSaveStatus('saving');
    try {
      await updateDocument({ title: newTitle });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('idle');
    }
  }, 2000);


  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    handleTitleSave(newTitle);

    e.target.style.height = 'inherit';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const notesInView = (sidebarDocuments || []).map((item) =>
    item._id === document?._id
      ? {
        ...item,
        title: title || item.title,
        updatedAt: document.updatedAt,
        isPublished: document.isPublished,
      }
      : item
  );

  const noteStats = document
    ? [
      {
        label: 'Visibility',
        value: document.isPublished ? 'Live' : 'Draft',
        note: document.isPublished ? 'Shared publicly' : 'Private to your workspace',
        icon: Globe,
        tone: document.isPublished
          ? 'border-border bg-muted text-foreground'
          : 'border-border bg-muted text-muted-foreground',
      },
      {
        label: 'Words',
        value: wordCount,
        note: 'Current note length',
        icon: FileText,
        tone: 'border-border bg-muted text-foreground',
      },
      {
        label: 'Read Time',
        value: `${readingTime} min`,
        note: 'Estimated reading time',
        icon: Clock3,
        tone: 'border-border bg-muted text-foreground',
      },
      {
        label: 'Updated',
        value: formatDistanceToNow(new Date(document.updatedAt), { addSuffix: true }),
        note: 'Latest saved change',
        icon: Calendar,
        tone: 'border-border bg-muted text-foreground',
      },
    ]
    : [];

  if (isLoading || initialContent === null) {
    return (
      <div className="space-y-5 p-5">
        <div className="flex flex-col gap-5 lg:flex-row">
          <Skeleton className="h-[420px] w-full rounded-[12px] lg:w-[320px]" />
          <div className="min-w-0 flex-1 space-y-5">
            <Skeleton className="h-40 w-full rounded-[12px]" />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
              <Skeleton className="h-[720px] w-full rounded-[12px]" />
              <div className="space-y-4">
                <Skeleton className="h-44 w-full rounded-[12px]" />
                <Skeleton className="h-40 w-full rounded-[12px]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!document || (!document && !isLoading) || docError) {
    return (
      <div className="p-8 text-center">
        <p className='font-semibold'>Document not found.</p>
        <p className='text-muted-foreground'>
          {docError ? docError.message : "This document may have been deleted or you don't have permission to view it."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-5 pt-3 pb-8">
      <div className="flex flex-col gap-5 lg:flex-row">
        <aside
          className={cn(
            'shrink-0 transition-all duration-200 ease-out lg:sticky lg:top-5 lg:self-start',
            isNotesSidebarCollapsed ? 'lg:w-[92px]' : 'lg:w-[320px]'
          )}
        >
          <div className="overflow-hidden rounded-[12px] border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-3">
              <div
                className={cn(
                  'flex min-w-0 items-center gap-3',
                  isNotesSidebarCollapsed && 'lg:justify-center'
                )}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-primary/15 bg-primary/10 text-primary">
                  <FolderOpen className="size-4" />
                </div>
                <div className={cn('min-w-0', isNotesSidebarCollapsed && 'lg:hidden')}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Note switcher
                  </p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {currentFolder?.name || 'All docs'}
                  </p>
                </div>
              </div>

              <IconButton
                icon={isNotesSidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
                className="hidden lg:inline-flex"
                onClick={toggleNotesSidebar}
                aria-label={isNotesSidebarCollapsed ? 'Expand notes sidebar' : 'Collapse notes sidebar'}
              />
            </div>

            <div className="space-y-4 p-3">
              <Button
                variant="outline"
                className={cn(
                  'h-9 rounded-[0.4rem] border-border/60 bg-background/70',
                  isNotesSidebarCollapsed
                    ? 'w-full justify-center px-0'
                    : 'w-full justify-start'
                )}
                onClick={handleCreateSiblingDoc}
                title="New note"
              >
                <Plus className="size-4 shrink-0" />
                <span className={cn(isNotesSidebarCollapsed && 'lg:hidden', 'ml-2')}>
                  New note
                </span>
              </Button>



              <div className="space-y-2">
                <div
                  className={cn(
                    'flex items-center justify-between gap-3 px-1',
                    isNotesSidebarCollapsed && 'lg:justify-center'
                  )}
                >
                  <div className={cn(isNotesSidebarCollapsed && 'lg:hidden')}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Notes
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {notesInView.length} in this view
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  {isSidebarLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={`sk-${index}`} className="h-10 rounded-[10px]" />
                    ))
                  ) : notesInView.length === 0 ? (
                    <div
                      className={cn(
                        'rounded-[12px] border border-dashed border-border/60 bg-background/40 px-3 py-4 text-sm text-muted-foreground',
                        isNotesSidebarCollapsed && 'lg:hidden'
                      )}
                    >
                      No notes in this section yet.
                    </div>
                  ) : (
                    notesInView.map((item) => {
                      const isActive = item._id === id;
                      return (
                        <button
                          key={item._id}
                          type="button"
                          onClick={() => routerPush(`/docs/${item._id}`)}
                          title={item.title}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-[10px] border border-transparent px-3 py-2.5 text-left transition-colors',
                            isActive
                              ? 'border-primary/20 bg-primary/10 text-primary'
                              : 'hover:border-border/60 hover:bg-muted/30',
                            isNotesSidebarCollapsed && 'lg:justify-center lg:px-0'
                          )}
                        >
                          <div
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-[10px] border',
                              isActive
                                ? 'border-primary/20 bg-primary/10 text-primary'
                                : 'border-border/60 bg-background/80 text-muted-foreground'
                            )}
                          >
                            <FileText className="size-4" />
                          </div>
                          <div className={cn('min-w-0 flex-1', isNotesSidebarCollapsed && 'lg:hidden')}>
                            <p
                              className={cn(
                                'truncate text-sm font-medium',
                                isActive ? 'text-primary' : 'text-foreground'
                              )}
                            >
                              {item.title || 'Untitled'}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              Updated {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-5">
          <section className="rounded-[12px] border bg-card shadow-sm">
            <div className="space-y-4 px-5 py-4">
              <div className="group flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <textarea
                    value={title}
                    onChange={handleTitleChange}
                    placeholder="Untitled"
                    aria-label="Document title"
                    className="w-full resize-none border-none bg-transparent text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-4xl"
                    rows={1}
                    style={{ minHeight: '60px' }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5">
                    <Calendar className="size-3.5" />
                    <span>{format(new Date(document.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5">
                    <Clock className="size-3.5" />
                    <span>{readingTime} min read</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5">
                    <FileText className="size-3.5" />
                    <span>{wordCount} words</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5">
                    <SaveIndicator saveStatus={saveStatus} updatedAt={document?.updatedAt} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Chip tone={document.isPublished ? 'ok' : 'warn'}>
                    {document.isPublished ? 'Published' : 'Draft'}
                  </Chip>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <div id="printable-content" className="overflow-hidden rounded-[12px] border bg-card shadow-sm">
              <div className="border-b border-border/60 px-5 py-4">
                  <div className="flex justify-end">
                    <EditorToolbar editor={editor} variant="docs" />
                  </div>
                </div>

                <div className="px-5 py-6">
                  <Editor
                    key={`${id}-${linkedFormId || 'no-linked-form'}`}
                    content={initialContent}
                    onChange={handleContentSave}
                    onEditorReady={(editorInstance) => setEditor(editorInstance)}
                    variant="docs"
                    extensions={[
                      FormEmbedNode,
                      SlashCommand.configure({
                        linkedFormId: linkedFormId || null,
                        linkedFormTitle: linkedForm?.title || null,
                      }),
                    ]}
                  />
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[12px] border bg-card p-4 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-[8px] border border-primary/15 bg-primary/10 text-primary flex-shrink-0">
                    <Globe className="size-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Sharing</p>
                    <p className="text-xs text-muted-foreground">Manage how this note is exposed outside the workspace.</p>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <Button
                    variant="outline"
                    className="justify-start rounded-[0.4rem]"
                    onClick={handleCopyPublicUrl}
                    disabled={!document.isPublished}
                  >
                    <Link2 className="mr-2 size-4" />
                    Copy public link
                  </Button>
                </div>
              </div>

              {document.referenceType === 'form' && linkedForm ? (
                <div className="rounded-[12px] border bg-card p-4 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-[8px] border border-primary/15 bg-primary/10 text-primary flex-shrink-0">
                      <BookText className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Linked Form</p>
                      <p className="text-xs text-muted-foreground">This note is attached to a live form workflow.</p>
                    </div>
                  </div>

                  <div className="rounded-[12px] border bg-background px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Form
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">{linkedForm.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {linkedForm.submissionsCount || 0} submissions • {linkedForm.views || 0} views
                    </p>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <Button
                      variant="outline"
                      className="justify-start rounded-[0.4rem]"
                      onClick={handleOpenLinkedForm}
                    >
                      <BookText className="mr-2 size-4" />
                      Open form editor
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start rounded-[0.4rem]"
                      onClick={() => {
                        setIsFormLinkDialogOpen(true);
                        if (!availableForms.length) {
                          void loadAvailableForms();
                        }
                      }}
                    >
                      <Link2 className="mr-2 size-4" />
                      Link existing form
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start rounded-[0.4rem]"
                      asChild={linkedForm.isPublished}
                      disabled={!linkedForm.isPublished}
                    >
                      {linkedForm.isPublished ? (
                        <Link href={`/f/${linkedForm.slug || linkedFormId}`} target="_blank">
                          <ExternalLink className="mr-2 size-4" />
                          Open public form
                        </Link>
                      ) : (
                        <>
                          <ExternalLink className="mr-2 size-4" />
                          Open public form
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}

              {!linkedFormId ? (
                <div className="rounded-[12px] border bg-card p-4 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-[8px] border border-primary/15 bg-primary/10 text-primary flex-shrink-0">
                      <BookText className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Linked Form</p>
                      <p className="text-xs text-muted-foreground">
                        Create or open the form that belongs to this note.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[12px] border border-dashed bg-background px-3 py-4">
                    <p className="text-sm font-medium text-foreground">No form linked yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Connect this note to an existing form, or create a new one if needed.
                    </p>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start rounded-[0.4rem]"
                      onClick={() => {
                        setIsFormLinkDialogOpen(true);
                        if (!availableForms.length) {
                          void loadAvailableForms();
                        }
                      }}
                    >
                      <Link2 className="mr-2 size-4" />
                      Link existing form
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start rounded-[0.4rem]"
                      onClick={handleCreateLinkedForm}
                      disabled={isLinkingForm}
                    >
                      {isLinkingForm ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 size-4" />
                      )}
                      Create new linked form
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                {noteStats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className="rounded-[12px] border bg-background/80 p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            {stat.label}
                          </p>
                          <p className="mt-1.5 truncate text-lg font-semibold tracking-tight">
                            {stat.value}
                          </p>
                        </div>
                        <div className={`flex size-8 shrink-0 items-center justify-center rounded-[8px] border ${stat.tone}`}>
                          <Icon className="size-3.5" />
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{stat.note}</p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-[12px] border bg-card p-4 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-[8px] border border-border bg-muted text-muted-foreground flex-shrink-0">
                    <FolderOpen className="size-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Context</p>
                    <p className="text-xs text-muted-foreground">Keep this note anchored to the right workspace area.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-[12px] border bg-background px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Current location
                    </p>
                    <p className="mt-2 text-sm text-foreground">{currentFolder?.name || 'Root docs workspace'}</p>
                  </div>
                  <div className="rounded-[12px] border bg-background px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Last updated
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {format(new Date(document.updatedAt), 'MMM d, yyyy • p')}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <ResourceLinkDialog
        open={isFormLinkDialogOpen}
        onOpenChange={setIsFormLinkDialogOpen}
        title="Link Existing Form"
        description="Connect this note to a form you already have, or create a new one if needed."
        searchPlaceholder="Search forms..."
        emptyLabel="No forms found"
        items={availableForms}
        isLoading={isFormsLoading}
        createLabel="Create new linked form"
        onCreate={handleCreateLinkedForm}
        onSelect={handleLinkExistingForm}
      />
    </div>
  );
}
