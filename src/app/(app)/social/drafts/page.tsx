'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import { FileText, Image as ImageIcon, Layers3, Loader2, PenSquare, Search, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { ModuleShell } from '@/components/shell/module-shell';
import {
  SocialEmptyState,
  SocialStatCard,
  SocialStatGrid,
  SocialToolbar,
} from '@/components/social/social-workspace';
import {
  ActionMenu,
  Button,
  Chip,
  Input,
  Segmented,
  Select,
  Skeleton,
} from '@/components/ui-kit';
import { Button as LinkButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Brand {
  _id: string;
  name: string;
  handle: string;
}

interface Draft {
  id: string;
  brandId: string;
  title: string;
  content: string;
  mediaCount: number;
  platformCount: number;
  lastEditedAt: string;
  createdAt: string;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function ViewToggle({
  value,
  onChange,
}: {
  value: 'list' | 'grid';
  onChange: (value: 'list' | 'grid') => void;
}) {
  return (
    <Segmented
      options={[
        { value: 'list', label: 'List' },
        { value: 'grid', label: 'Grid' },
      ]}
      value={value}
      onChange={(v) => onChange(v as 'list' | 'grid')}
    />
  );
}

function DraftMenu({
  draftId,
  onEdit,
  onDelete,
}: {
  draftId: string;
  onEdit: (draftId: string) => void;
  onDelete: (draftId: string) => void;
}) {
  return (
    <ActionMenu
      items={[
        { label: 'Open', icon: PenSquare, onSelect: () => onEdit(draftId) },
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          onSelect: () => {
            if (confirm('Delete this draft?')) {
              onDelete(draftId);
            }
          },
        },
      ]}
    />
  );
}

export default function DraftsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedDrafts, setSelectedDrafts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const { push } = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    async function fetchBrands() {
      try {
        const response = await fetch('/api/social/brands');
        if (!response.ok) {
          throw new Error('Failed to load brands');
        }

        const data = await response.json();
        setBrands(data.brands || []);
        if (data.brands?.length > 0) {
          setSelectedBrandId(data.brands[0]._id);
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Failed to load brands',
          description: getErrorMessage(error),
        });
        setIsLoading(false);
      }
    }

    fetchBrands();
  }, [toast]);

  const fetchDrafts = useCallback(async () => {
    if (!selectedBrandId) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/social/drafts?brandId=${selectedBrandId}`);
      if (!response.ok) {
        throw new Error('Failed to load drafts');
      }

      const data = await response.json();
      setDrafts(data.drafts || []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to load drafts',
        description: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedBrandId, toast]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand._id === selectedBrandId) || null,
    [brands, selectedBrandId],
  );

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/social/drafts?id=${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to delete draft');
      }

      setDrafts((current) => current.filter((draft) => draft.id !== id));
      setSelectedDrafts((current) => current.filter((draftId) => draftId !== id));
      toast({ title: 'Draft deleted' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete draft',
        description: getErrorMessage(error),
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDrafts.length === 0 || !confirm(`Delete ${selectedDrafts.length} drafts?`)) {
      return;
    }

    await Promise.all(selectedDrafts.map((draftId) => handleDelete(draftId)));
    setSelectedDrafts([]);
  };

  const handleEdit = (draftId: string) => {
    push(`/social/create-post?draftId=${draftId}`);
  };

  const filteredDrafts = useMemo(
    () =>
      drafts.filter((draft) => {
        const search = searchQuery.trim().toLowerCase();
        if (!search) {
          return true;
        }

        return (
          draft.title.toLowerCase().includes(search) ||
          draft.content.toLowerCase().includes(search)
        );
      }),
    [drafts, searchQuery],
  );

  const allSelected =
    filteredDrafts.length > 0 &&
    filteredDrafts.every((draft) => selectedDrafts.includes(draft.id));

  const draftsWithMedia = drafts.filter((draft) => draft.mediaCount > 0).length;
  const multiPlatformDrafts = drafts.filter((draft) => draft.platformCount > 1).length;
  const updatedToday = drafts.filter((draft) => isToday(new Date(draft.lastEditedAt))).length;

  const toggleSelected = (draftId: string) => {
    setSelectedDrafts((current) =>
      current.includes(draftId)
        ? current.filter((id) => id !== draftId)
        : [...current, draftId],
    );
  };

  const toggleSelectAll = () => {
    setSelectedDrafts(allSelected ? [] : filteredDrafts.map((draft) => draft.id));
  };

  const filterBar = (
    <SocialToolbar>
      <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
        {brands.length > 1 ? (
          <Select
            value={selectedBrandId}
            onChange={setSelectedBrandId}
            placeholder="Select brand"
            triggerClassName="w-full lg:w-[220px]"
            options={brands.map((brand) => ({ value: brand._id, label: brand.name }))}
          />
        ) : null}

        <Input
          icon={Search}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search drafts..."
          wrapClassName="lg:max-w-sm lg:flex-1"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {selectedDrafts.length > 0 ? (
          <>
            <Chip tone="brand">{selectedDrafts.length} selected</Chip>
            <Button variant="outline" size="sm" onClick={() => setSelectedDrafts([])}>
              Clear
            </Button>
            <Button variant="primary" size="sm" icon={Trash2} onClick={handleBulkDelete}>
              Delete
            </Button>
          </>
        ) : null}
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>
    </SocialToolbar>
  );

  if (!isLoading && brands.length === 0) {
    return (
      <ModuleShell title="Drafts" icon={FileText} contentClassName="flex flex-col gap-3 pb-8">
        <SocialEmptyState
          icon={Layers3}
          title="No brands yet"
          description="Create a brand before saving drafts."
          action={{ label: 'Open settings', href: '/settings?tab=connections' }}
        />
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      title="Drafts"
      icon={FileText}
      meta={
        selectedBrand
          ? `${selectedBrand.name} · ${drafts.length} drafts`
          : `${drafts.length} drafts`
      }
      primaryAction={
        <LinkButton asChild size="sm">
          <Link href="/social/create-post">
            <PenSquare className="mr-2 size-4" />
            New post
          </Link>
        </LinkButton>
      }
      filterBar={filterBar}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <SocialStatGrid>
        <SocialStatCard
          label="Drafts"
          value={String(drafts.length)}
          helper={`${filteredDrafts.length} visible`}
          icon={FileText}
          tone="purple"
        />
        <SocialStatCard
          label="With media"
          value={String(draftsWithMedia)}
          helper="Ready for visual review"
          icon={ImageIcon}
          tone="blue"
        />
        <SocialStatCard
          label="Multi-platform"
          value={String(multiPlatformDrafts)}
          helper="More than one platform selected"
          icon={Users}
          tone="green"
        />
        <SocialStatCard
          label="Updated today"
          value={String(updatedToday)}
          helper="Latest edits in this workspace"
          icon={Loader2}
          tone="amber"
        />
      </SocialStatGrid>

      {isLoading ? (
        <div className={cn('grid gap-4', viewMode === 'grid' ? 'md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1')}>
          {Array.from({ length: viewMode === 'grid' ? 6 : 4 }).map((_, index) => (
            <Skeleton key={`skeleton-${index}`} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : filteredDrafts.length === 0 ? (
        <SocialEmptyState
          icon={FileText}
          title={drafts.length === 0 ? 'No drafts yet' : 'No results'}
          description={
            drafts.length === 0
              ? 'Start a post and save it as a draft to keep writing later.'
              : 'No drafts match your search.'
          }
          action={{ label: 'New post', href: '/social/create-post' }}
        />
      ) : viewMode === 'list' ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1.4fr)_120px_120px_56px] items-center gap-3 border-b border-border bg-secondary/50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
            <span>Title</span>
            <span>Preview</span>
            <span>Media</span>
            <span>Updated</span>
            <span />
          </div>
          <div className="divide-y divide-border">
            {filteredDrafts.map((draft) => (
              <div
                key={draft.id}
                className="grid grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1.4fr)_120px_120px_56px] items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/40"
              >
                <div onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={selectedDrafts.includes(draft.id)}
                    onCheckedChange={() => toggleSelected(draft.id)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleEdit(draft.id)}
                  className="min-w-0 text-left"
                >
                  <p className="truncate text-sm font-medium">{draft.title || 'Untitled draft'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {draft.platformCount} platform{draft.platformCount === 1 ? '' : 's'}
                  </p>
                </button>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {draft.content || 'No content yet'}
                </p>
                <div>
                  <Chip tone="gray">{draft.mediaCount} media</Chip>
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(draft.lastEditedAt), { addSuffix: true })}
                </div>
                <DraftMenu draftId={draft.id} onEdit={handleEdit} onDelete={handleDelete} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredDrafts.map((draft) => {
            const isSelected = selectedDrafts.includes(draft.id);
            const isDeleting = deletingId === draft.id;

            return (
              <div
                key={draft.id}
                className={cn(
                  'rounded-lg border border-border bg-card p-5 shadow-card transition-colors',
                  isSelected && 'border-brand/40 ring-2 ring-brand/15',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-muted p-3 text-brand-strong">
                      <FileText className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{draft.title || 'Untitled draft'}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(draft.lastEditedAt), 'MMM d')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelected(draft.id)}
                    />
                    <DraftMenu draftId={draft.id} onEdit={handleEdit} onDelete={handleDelete} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleEdit(draft.id)}
                  className="mt-4 w-full text-left"
                >
                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {draft.content || 'No content yet'}
                  </p>
                </button>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Chip tone="gray">{draft.mediaCount} media</Chip>
                  <Chip tone="gray">
                    {draft.platformCount} platform{draft.platformCount === 1 ? '' : 's'}
                  </Chip>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDistanceToNow(new Date(draft.lastEditedAt), { addSuffix: true })}</span>
                  {isDeleting ? <span>Deleting...</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModuleShell>
  );
}
