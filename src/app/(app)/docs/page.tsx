'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Loader2,
  Clock3,
  Plus,
  PlusCircle,
  FileText,
  BookText,
  Folder as FolderIcon,
  Globe,
  Share2,
  Trash2,
  Pencil,
  FolderPlus,
  List as ListIcon,
  Users,
  Lock,
  LayoutGrid,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

import {
  Button,
  Chip,
  KpiTile,
  Skeleton,
  EmptyState,
  BulkBar,
  ActionMenu,
  FormDialog,
  ConfirmDialog,
  CopyField,
  Field,
  Input,
  SearchInput,
  type Pastel,
} from '@/components/ui-kit';
import { useDocs, useFolder, type Document, type Folder } from '@/hooks/use-docs-v2';
import { useToast } from '@/hooks/use-toast';
import { useAppHeader } from '@/components/app-header';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { openAgentLauncher } from '@/lib/agent/launcher';
import { docsStarterTemplates } from '@/lib/docs/overview-content';
import { cn } from '@/lib/utils';

import styles from './docs.module.css';

type ItemType = 'document' | 'folder';
type ViewScope = 'mine' | 'shared';
type CombinedItem = (Document | Folder) & { type: ItemType };

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onConfirm: (name: string) => Promise<void>;
  type: ItemType;
}

function RenameDialog({ open, onOpenChange, title, onConfirm, type }: RenameDialogProps) {
  const [name, setName] = useState(title);

  useEffect(() => setName(title), [title, open]);

  const handleConfirm = async () => {
    if (!name.trim()) return;
    await onConfirm(name);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Rename ${type}`}
      icon={Pencil}
      size="sm"
      submitDisabled={!name.trim()}
      onSubmit={handleConfirm}
    >
      <Field label="Name" htmlFor="name">
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

function ShareDialog({
  open,
  onOpenChange,
  title,
  publishedUrl,
  isPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  publishedUrl?: string;
  isPublished?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Share &quot;{title}&quot;</DialogTitle>
          <DialogDescription>Copy the public link or publish first to make it available.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Globe className="size-4 text-brand-strong" />
              <span className="text-sm font-medium">Public access</span>
            </div>
            <Chip tone={isPublished ? 'ok' : 'gray'}>{isPublished ? 'Live' : 'Private'}</Chip>
          </div>
          {publishedUrl ? (
            <CopyField value={publishedUrl} />
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              Publish this item to get a shareable link.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemActions({
  onAction,
  isPublished,
}: {
  onAction: (action: 'rename' | 'share' | 'publish' | 'delete') => void;
  isPublished: boolean;
}) {
  return (
    <ActionMenu
      items={[
        { label: 'Rename', icon: Pencil, onSelect: () => onAction('rename') },
        { label: 'Share', icon: Share2, onSelect: () => onAction('share') },
        {
          label: isPublished ? 'Unpublish' : 'Publish',
          icon: isPublished ? Lock : Globe,
          onSelect: () => onAction('publish'),
        },
        { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => onAction('delete') },
      ]}
    />
  );
}

const templateIconMap = {
  'meeting-notes': Users,
  'project-proposal': FileText,
  'project-plan': ListIcon,
  'system-architecture': LayoutGrid,
} as const;

function getRelativeTime(value?: string | Date) {
  if (!value) return 'No activity yet';
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

interface StatCardData {
  label: string;
  value: React.ReactNode;
  helper: string;
  detail: string;
  icon: typeof FileText;
  pastel: Pastel;
}

function StatsSection({ isLoading, statCards }: { isLoading: boolean; statCards: StatCardData[] }) {
  return (
    <section className={styles.statsRow}>
      {isLoading
        ? Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`stat-sk-${index}`} className="h-[82px] rounded-[12px]" />
          ))
        : statCards.map((card) => (
            <KpiTile
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              pastel={card.pastel}
              sub={
                <>
                  <span className="block truncate text-[12px] text-muted-foreground">{card.helper}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground/80">{card.detail}</span>
                </>
              }
            />
          ))}
    </section>
  );
}

function TemplateStrip({
  createType,
  onCreateDoc,
  onCreateFromTemplate,
}: {
  createType: 'doc' | 'folder' | null;
  onCreateDoc: () => void;
  onCreateFromTemplate: (template: typeof docsStarterTemplates[number]) => void;
}) {
  return (
    <section className={cn('app-glass', styles.templateStrip)}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionTitle}>Quick Start</p>
          <p className={styles.sectionSubtitle}>
            Start a blank note or spin up one of the common document frameworks without leaving the workspace.
          </p>
        </div>
      </div>

      <div className={styles.templateRow}>
        <button type="button" onClick={onCreateDoc} disabled={createType === 'doc'} className={styles.newTemplateCard}>
          <div className={styles.newTemplateIcon}>
            {createType === 'doc' ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          </div>
          <div>
            <p className={styles.newTemplateLabel}>Blank Doc</p>
            <p className={styles.newTemplateSubtext}>Open an empty note and structure it yourself.</p>
          </div>
        </button>

        {docsStarterTemplates.map((template, index) => {
          const IconComponent = (templateIconMap as Record<string, React.ComponentType<{ className?: string }>>)[template.id];
          const toneClass =
            index % 4 === 0 ? styles.templateTonePrimary : index % 4 === 1 ? styles.templateToneBlue : index % 4 === 2 ? styles.templateToneGreen : styles.templateToneAmber;
          const iconTone =
            index % 4 === 0 ? styles.iconPurple : index % 4 === 1 ? styles.iconBlue : index % 4 === 2 ? styles.iconGreen : styles.iconAmber;

          return (
            <button key={template.id} type="button" onClick={() => void onCreateFromTemplate(template)} disabled={createType === 'doc'} className={cn(styles.templateCard, toneClass)}>
              <span className={styles.templateCategory}>Template</span>
              <div className={cn(styles.templateIcon, iconTone)}>
                <IconComponent className="size-3.5" />
              </div>
              <p className={styles.templateName}>{template.title}</p>
              <p className={styles.templateDescription}>{template.description}</p>
              <div className={styles.templateFooter}>
                <span>Starter structure</span>
                <span className={styles.templateUse}>Use</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function DocsPage() {
  const { push: routerPush } = useRouter();
  const { toast } = useToast();
  const { setHeaderInfo } = useAppHeader();

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [viewScope, setViewScope] = useState<ViewScope>('mine');
  const [createType, setCreateType] = useState<'doc' | 'folder' | null>(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [actionItem, setActionItem] = useState<{ id: string; type: ItemType; title: string; data?: CombinedItem } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  const { documents, folders, isLoading, createDocument, createFolder, deleteDocument, deleteFolder, updateDocument, updateFolder } = useDocs({
    folderId: currentFolderId,
    view: viewScope,
  });

  const { folder: currentFolder } = useFolder(currentFolderId);

  const handleCreateDoc = useCallback(async () => {
    setCreateType('doc');
    try {
      const doc = await createDocument('Untitled Document');
      routerPush(`/docs/${doc._id}`);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to create document.' });
      setCreateType(null);
    }
  }, [createDocument, routerPush, toast]);

  const handleCreateFromTemplate = async (template: typeof docsStarterTemplates[number]) => {
    setCreateType('doc');
    try {
      const doc = await createDocument(template.title, template.content);
      routerPush(`/docs/${doc._id}`);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to create document.' });
      setCreateType(null);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName);
      setNewFolderName('');
      toast({ title: 'Success', description: 'Folder created.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to create folder.' });
      throw err;
    }
  };

  const handleNavigate = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSelectedItems([]);
    setSearchQuery('');
  };

  const handleRename = async (name: string) => {
    if (!actionItem) return;
    try {
      if (actionItem.type === 'document') {
        await updateDocument(actionItem.id, { title: name });
      } else {
        await updateFolder(actionItem.id, { name });
      }
      toast({ title: 'Success', description: 'Renamed successfully.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to rename.' });
    }
  };

  const handleDelete = async (id: string, type: ItemType) => {
    try {
      if (type === 'document') await deleteDocument(id);
      else await deleteFolder(id);
      toast({ title: 'Deleted', description: 'Item removed.' });
      setSelectedItems((prev) => prev.filter((itemId) => itemId !== id));
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete.' });
    }
  };

  const handlePublishToggle = async (id: string, type: ItemType, currentStatus: boolean) => {
    try {
      const newData = { isPublished: !currentStatus };
      if (type === 'document') await updateDocument(id, newData);
      else await updateFolder(id, newData);
      toast({
        title: !currentStatus ? 'Published' : 'Unpublished',
        description: `${type} is now ${!currentStatus ? 'public' : 'private'}.`,
      });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update status.' });
    }
  };

  const handleAskAgent = useCallback(() => {
    openAgentLauncher({
      prompt: 'Review this docs workspace and turn the most important knowledge gaps, organization fixes, or follow-up writing work into an actionable mission.',
      context: {
        source: 'docs_workspace',
        entityType: 'docs_workspace',
        entityLabel: currentFolder?.name || 'Workspace root',
        route: '/docs',
        notes: [
          `Scope: ${viewScope === 'shared' ? 'shared docs' : 'my docs'}`,
          currentFolder?.name ? `Current folder: ${currentFolder.name}` : 'Current folder: workspace root',
          `Visible documents: ${documents?.length ?? 0}`,
          `Visible folders: ${folders?.length ?? 0}`,
          `Published docs: ${(documents || []).filter((doc) => doc.isPublished).length}`,
          searchQuery ? `Search filter: ${searchQuery}` : 'No search filter applied',
        ],
      },
    });
  }, [currentFolder?.name, documents, folders, searchQuery, viewScope]);

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'Docs',
      description: currentFolder?.name ? `Inside ${currentFolder.name}` : 'Knowledge workspace',
      actions: (
        <div className="flex gap-2">
          <Button onClick={handleAskAgent} size="sm" variant="outline" icon={Sparkles}>
            Ask Agent
          </Button>
          <Button onClick={() => setIsCreateFolderOpen(true)} size="sm" variant="outline" icon={FolderPlus}>
            New Folder
          </Button>
          <Button
            onClick={handleCreateDoc}
            disabled={createType === 'doc'}
            size="sm"
            variant="brand"
            icon={createType === 'doc' ? undefined : PlusCircle}
          >
            {createType === 'doc' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            New Doc
          </Button>
        </div>
      ),
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo, handleCreateDoc, createType, handleAskAgent, currentFolder?.name]);

  const allItems: CombinedItem[] = useMemo(
    () => [
      ...(folders || [])
        .filter((folder) => folder.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .map((folder) => ({ ...folder, type: 'folder' as const })),
      ...(documents || [])
        .filter((document) => document.title.toLowerCase().includes(searchQuery.toLowerCase()))
        .map((document) => ({ ...document, type: 'document' as const })),
    ],
    [documents, folders, searchQuery],
  );

  const toggleSelected = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    const allIds = allItems.map((item) => item._id);
    if (selectedItems.length === allIds.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(allIds);
    }
  };

  const handleBulkDelete = async () => {
    try {
      await Promise.all(
        selectedItems.map(async (id) => {
          const item = allItems.find((entry) => entry._id === id);
          if (item?.type === 'folder') await deleteFolder(id);
          else if (item?.type === 'document') await deleteDocument(id);
        }),
      );
      setSelectedItems([]);
      toast({ title: 'Deleted', description: 'Items removed.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete some items.' });
    }
  };

  const handleBulkPublish = async (status: boolean) => {
    try {
      await Promise.all(
        selectedItems.map(async (id) => {
          const item = allItems.find((entry) => entry._id === id);
          const newData = { isPublished: status };
          if (item?.type === 'folder') await updateFolder(id, newData);
          else if (item?.type === 'document') await updateDocument(id, newData);
        }),
      );
      toast({
        title: status ? 'Published' : 'Unpublished',
        description: `${selectedItems.length} items updated.`,
      });
      setSelectedItems([]);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update items.' });
    }
  };

  const handleBulkShare = () => {
    const urls = selectedItems
      .map((id) => {
        const item = allItems.find((entry) => entry._id === id);
        if (item?.publishedSlug && item?.publishedUsername) {
          return `${window.location.origin}/p/${item.publishedUsername}/${item.publishedSlug}`;
        }
        return `${window.location.origin}/docs/${id}`;
      })
      .join('\n');

    navigator.clipboard.writeText(urls);
    toast({
      title: 'Links Copied',
      description: `${selectedItems.length} link(s) copied to clipboard.`,
    });
    setSelectedItems([]);
  };

  const allSelected = allItems.length > 0 && selectedItems.length === allItems.length;
  const docsCount = documents?.length ?? 0;
  const foldersCount = folders?.length ?? 0;
  const publishedCount = (documents || []).filter((doc) => doc.isPublished).length;
  const updatedThisWeekCount = (documents || []).filter((doc) => {
    const updatedAt = new Date(doc.updatedAt).getTime();
    return Date.now() - updatedAt < 7 * 24 * 60 * 60 * 1000;
  }).length;
  const latestDoc = documents?.[0];

  const statCards: StatCardData[] = [
    {
      label: 'Docs',
      value: docsCount,
      helper: latestDoc?.title || 'No docs yet',
      detail: latestDoc?.updatedAt ? `Updated ${getRelativeTime(latestDoc.updatedAt)}` : 'Start with a blank doc',
      icon: FileText,
      pastel: 'violet',
    },
    {
      label: 'Folders',
      value: foldersCount,
      helper: currentFolder?.name || 'Workspace root',
      detail: 'Collections organizing the knowledge base',
      icon: FolderIcon,
      pastel: 'blue',
    },
    {
      label: 'Published',
      value: publishedCount,
      helper: 'Shared to the web',
      detail: `${docsCount - publishedCount} still private`,
      icon: Globe,
      pastel: 'mint',
    },
    {
      label: 'Updated This Week',
      value: updatedThisWeekCount,
      helper: 'Fresh edits in the last 7 days',
      detail: viewScope === 'shared' ? 'Looking at shared docs only' : 'Looking at your workspace docs',
      icon: Clock3,
      pastel: 'peach',
    },
  ];

  const breadcrumbs = [
    { label: 'Docs', id: null as string | null },
    ...(currentFolder?.ancestors?.map((folder) => ({ label: folder.name, id: folder._id })) || []),
    ...(currentFolder ? [{ label: currentFolder.name, id: currentFolder._id }] : []),
  ];

  return (
    <div className={styles.page}>
      {!currentFolderId ? (
        <>
          <StatsSection isLoading={isLoading} statCards={statCards} />
          <TemplateStrip
            createType={createType}
            onCreateDoc={handleCreateDoc}
            onCreateFromTemplate={handleCreateFromTemplate}
          />
        </>
      ) : null}

      <section className={cn('app-glass', styles.librarySection)}>
        <div className={styles.toolbarWrap}>
          {selectedItems.length > 0 ? (
            <BulkBar count={selectedItems.length} onClear={() => setSelectedItems([])}>
              <Button variant="ghost" size="sm" onClick={() => void handleBulkPublish(true)}>Publish</Button>
              <Button variant="ghost" size="sm" onClick={() => void handleBulkPublish(false)}>Unpublish</Button>
              <Button variant="ghost" size="sm" onClick={handleBulkShare}>Share</Button>
              <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-muted" onClick={() => setIsBulkDeleteOpen(true)}>Delete</Button>
            </BulkBar>
          ) : null}

          <div className={cn(styles.toolbar, selectedItems.length > 0 && styles.toolbarHidden)}>
            <div className={styles.toolbarMain}>
              <div className={styles.toolbarIcon}>
                <BookText className="size-4" />
              </div>

              <div className={styles.crumbs}>
                {breadcrumbs.map((crumb, index) => (
                  <button
                    key={`${crumb.label}-${crumb.id ?? 'root'}`}
                    type="button"
                    className={cn(styles.crumb, index === breadcrumbs.length - 1 && styles.crumbActive)}
                    onClick={() => handleNavigate(crumb.id)}
                  >
                    {index > 0 ? <ChevronRight className="size-3 text-[color:var(--app-text-faint)]" /> : null}
                    <span>{crumb.label}</span>
                  </button>
                ))}
              </div>

              <SearchInput
                wrapClassName="min-w-[200px]"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search docs and folders..."
              />
            </div>

            <div className={styles.toolbarRight}>
              <div className={styles.scopeToggle}>
                <button type="button" className={cn(styles.scopeButton, viewScope === 'mine' && styles.scopeButtonActive)} onClick={() => { setViewScope('mine'); setSelectedItems([]); }}>
                  Mine
                </button>
                <button type="button" className={cn(styles.scopeButton, viewScope === 'shared' && styles.scopeButtonActive)} onClick={() => { setViewScope('shared'); setSelectedItems([]); }}>
                  Shared
                </button>
              </div>

              <div className={styles.viewToggle}>
                <button type="button" className={cn(styles.viewButton, viewMode === 'grid' && styles.viewButtonActive)} onClick={() => setViewMode('grid')} aria-label="Grid view">
                  <LayoutGrid className="size-3.5" />
                </button>
                <button type="button" className={cn(styles.viewButton, viewMode === 'list' && styles.viewButtonActive)} onClick={() => setViewMode('list')} aria-label="List view">
                  <ListIcon className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.libraryBody}>
          {isLoading ? (
            viewMode === 'grid' ? (
              <div className={styles.itemGrid}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`grid-sk-${index}`} className="rounded-[16px] border border-border/60 bg-background/60 p-4">
                    <Skeleton className="size-10 rounded-[12px]" />
                    <Skeleton className="mt-4 h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.itemList}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={`list-sk-${index}`} className="rounded-[10px] border border-border/60 bg-background/60 p-4">
                    <Skeleton className="h-6 w-full" />
                  </div>
                ))}
              </div>
            )
          ) : allItems.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No files yet"
              note="Get started by creating a new document or folder."
              cta={
                <Button variant="brand" size="sm" icon={Plus} onClick={handleCreateDoc}>
                  Create Doc
                </Button>
              }
            />
          ) : viewMode === 'list' ? (
            <div className={styles.itemList}>
              <div className={styles.listHeader}>
                <div className={styles.listHeaderMain}>
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} className="border-[color:var(--app-border-strong)]" />
                  <span>Name</span>
                </div>
                <span className={styles.listHeaderCell}>Type</span>
                <span className={styles.listHeaderCell}>Status</span>
                <span className={styles.listHeaderCell}>Updated</span>
                <span />
              </div>

              {allItems.map((item) => {
                const isFolder = item.type === 'folder';
                const title = isFolder ? (item as Folder).name : (item as Document).title;

                return (
                  <div key={item._id} className={cn(styles.listRow, selectedItems.includes(item._id) && styles.listRowSelected)}>
                    <div className={styles.listMain}>
                      <Checkbox checked={selectedItems.includes(item._id)} onCheckedChange={() => toggleSelected(item._id)} className="border-[color:var(--app-border-strong)]" />
                      <button type="button" className={styles.identity} onClick={() => (isFolder ? handleNavigate(item._id) : routerPush(`/docs/${item._id}`))}>
                        <div className={cn(styles.identityIcon, isFolder ? styles.iconIndigo : styles.iconPurple)}>
                          {isFolder ? <FolderIcon className="size-3.5" /> : <FileText className="size-3.5" />}
                        </div>
                        <div className={styles.identityCopy}>
                          <p className={styles.itemTitle}>{title}</p>
                          <p className={styles.itemSubline}>{isFolder ? 'Folder' : 'Document'} | {getRelativeTime(item.updatedAt)}</p>
                        </div>
                      </button>
                    </div>

                    <div className={styles.listCellMuted}>{isFolder ? 'Folder' : 'Doc'}</div>
                    <div className={styles.listCell}>
                      <Chip tone={item.isPublished ? 'ok' : 'gray'}>
                        {item.isPublished ? 'Published' : 'Private'}
                      </Chip>
                    </div>
                    <div className={styles.listCellMuted}>{format(new Date(item.updatedAt), 'MMM d, yyyy')}</div>
                    <div className={styles.listActions}>
                      <ItemActions
                        onAction={(action) => {
                          setActionItem({ id: item._id, type: item.type, title, data: item });
                          if (action === 'rename') setIsRenameOpen(true);
                          if (action === 'delete') void handleDelete(item._id, item.type);
                          if (action === 'share') setIsShareOpen(true);
                          if (action === 'publish') void handlePublishToggle(item._id, item.type, !!item.isPublished);
                        }}
                        isPublished={!!item.isPublished}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.itemGrid}>
              {allItems.map((item) => {
                const isFolder = item.type === 'folder';
                const title = isFolder ? (item as Folder).name : (item as Document).title;

                return (
                  <article key={item._id} className={cn(styles.itemCard, selectedItems.includes(item._id) && styles.itemCardSelected)}>
                    <div className={styles.itemCardTop}>
                      <div className={styles.itemSelection}>
                        <Checkbox
                          checked={selectedItems.includes(item._id)}
                          onCheckedChange={() => toggleSelected(item._id)}
                          className={cn(
                            'border-[color:var(--app-border-strong)] bg-[color:var(--app-surface-strong)] transition-opacity data-[state=checked]:border-primary data-[state=checked]:bg-primary',
                            !selectedItems.includes(item._id) && 'opacity-0 group-hover:opacity-100',
                          )}
                        />
                      </div>

                      <div className={cn(styles.identityIcon, isFolder ? styles.iconIndigo : styles.iconPurple)}>
                        {isFolder ? <FolderIcon className="size-4" /> : <FileText className="size-4" />}
                      </div>

                      <div className={styles.itemHead}>
                        <button type="button" className={styles.itemTitleLink} onClick={() => (isFolder ? handleNavigate(item._id) : routerPush(`/docs/${item._id}`))}>
                          {title}
                        </button>
                        <p className={styles.itemSubline}>Updated {getRelativeTime(item.updatedAt)}</p>
                      </div>

                      <ItemActions
                        onAction={(action) => {
                          setActionItem({ id: item._id, type: item.type, title, data: item });
                          if (action === 'rename') setIsRenameOpen(true);
                          if (action === 'delete') void handleDelete(item._id, item.type);
                          if (action === 'share') setIsShareOpen(true);
                          if (action === 'publish') void handlePublishToggle(item._id, item.type, !!item.isPublished);
                        }}
                        isPublished={!!item.isPublished}
                      />
                    </div>

                    <div className={styles.itemCardStats}>
                      <div className={styles.itemStat}>
                        <span className={styles.itemStatLabel}>Type</span>
                        <span className={styles.itemStatValue}>{isFolder ? 'Folder' : 'Doc'}</span>
                      </div>
                      <div className={styles.itemStat}>
                        <span className={styles.itemStatLabel}>Status</span>
                        <span className={styles.itemStatValue}>{item.isPublished ? 'Live' : 'Private'}</span>
                      </div>
                      <div className={styles.itemStat}>
                        <span className={styles.itemStatLabel}>Updated</span>
                        <span className={styles.itemStatValue} title={getRelativeTime(item.updatedAt)}>
                          {getRelativeTime(item.updatedAt)}
                        </span>
                      </div>
                    </div>

                    <div className={styles.itemCardFooter}>
                      <Chip tone={item.isPublished ? 'ok' : 'gray'}>
                        {item.isPublished ? 'Published' : 'Private'}
                      </Chip>
                      <button type="button" className={styles.inlineLink} onClick={() => (isFolder ? handleNavigate(item._id) : routerPush(`/docs/${item._id}`))}>
                        {isFolder ? 'Open Folder' : 'Open Doc'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={isBulkDeleteOpen}
        onOpenChange={setIsBulkDeleteOpen}
        title="Delete selected items?"
        description={`This will permanently delete ${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'}. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
      />

      <FormDialog
        open={isCreateFolderOpen}
        onOpenChange={setIsCreateFolderOpen}
        title="Create New Folder"
        icon={FolderPlus}
        size="sm"
        submitLabel="Create"
        submitDisabled={!newFolderName.trim()}
        onSubmit={handleCreateFolder}
      >
        <Field label="Folder Name" htmlFor="folderName">
          <Input
            id="folderName"
            placeholder="Folder Name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
        </Field>
      </FormDialog>

      {actionItem ? (
        <>
          <RenameDialog
            open={isRenameOpen}
            onOpenChange={setIsRenameOpen}
            title={actionItem.title}
            type={actionItem.type}
            onConfirm={handleRename}
          />
          <ShareDialog
            open={isShareOpen}
            onOpenChange={setIsShareOpen}
            title={actionItem.title}
            isPublished={actionItem.data?.isPublished}
            publishedUrl={
              actionItem.data?.publishedSlug
                ? `${window.location.origin}/p/${actionItem.data.publishedUsername || 'u'}/${actionItem.data.publishedSlug}`
                : undefined
            }
          />
        </>
      ) : null}
    </div>
  );
}
