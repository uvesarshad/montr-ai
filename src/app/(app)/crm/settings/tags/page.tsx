'use client';

import { useReducer, useState } from 'react';
import { ModuleShell } from '@/components/shell/module-shell';
import { useTags } from '@/hooks/crm/use-tags';
import { Tag } from '@/types/crm';
import { CreateTagDialog } from '@/components/crm/tags/create-tag-dialog';
import { TagItem } from '@/components/crm/tags/tag-item';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Tag as TagIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface MergeDialogState {
  open: boolean;
  sourceTag: Tag | null;
  targetId: string;
}

type MergeDialogAction =
  | { type: 'open'; sourceTag: Tag }
  | { type: 'setOpen'; open: boolean }
  | { type: 'setTargetId'; targetId: string }
  | { type: 'reset' };

const initialMergeDialogState: MergeDialogState = {
  open: false,
  sourceTag: null,
  targetId: '',
};

function mergeDialogReducer(state: MergeDialogState, action: MergeDialogAction): MergeDialogState {
  switch (action.type) {
    case 'open':
      return { open: true, sourceTag: action.sourceTag, targetId: '' };
    case 'setOpen':
      return { ...state, open: action.open };
    case 'setTargetId':
      return { ...state, targetId: action.targetId };
    case 'reset':
      return { open: false, sourceTag: null, targetId: '' };
    default:
      return state;
  }
}

export default function TagsSettingsPage() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | undefined>();

  // Merge dialog state
  const [{ open: mergeDialogOpen, sourceTag: mergeSourceTag, targetId: mergeTargetId }, dispatchMerge] =
    useReducer(mergeDialogReducer, initialMergeDialogState);
  const [merging, setMerging] = useState(false);

  const { tags, loading, error, refetch, deleteTag, mergeTag } = useTags({
    type: activeTab === 'all' ? undefined : activeTab,
    limit: 200,
  });

  const filtered = search.trim()
    ? tags.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description?.toLowerCase().includes(search.toLowerCase())
      )
    : tags;

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setCreateOpen(true);
  };

  const handleDelete = async (tag: Tag) => {
    if (!confirm(`Delete tag "${tag.name}"? This cannot be undone.`)) return;
    try {
      await deleteTag(tag._id);
      toast({ title: 'Tag deleted' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to delete tag' });
    }
  };

  const handleMergeOpen = (tag: Tag) => {
    dispatchMerge({ type: 'open', sourceTag: tag });
  };

  const handleMergeConfirm = async () => {
    if (!mergeSourceTag || !mergeTargetId) return;
    setMerging(true);
    try {
      await mergeTag(mergeSourceTag._id, mergeTargetId);
      toast({
        title: 'Tags merged',
        description: `"${mergeSourceTag.name}" has been merged into the target tag.`,
      });
      dispatchMerge({ type: 'reset' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to merge tags' });
    } finally {
      setMerging(false);
    }
  };

  const mergeTargetOptions = tags.filter(t => t._id !== mergeSourceTag?._id);

  const filterBar = (
    <div className="flex items-center gap-2">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search tags..."
          className="h-9 pl-8"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
    </div>
  );

  const tagsSettingsPrimaryAction = (
    <CreateTagDialog
      open={createOpen}
      onOpenChange={open => {
        setCreateOpen(open);
        if (!open) setEditingTag(undefined);
      }}
      tag={editingTag}
      onSuccess={() => {
        refetch();
        setEditingTag(undefined);
      }}
      trigger={
        <Button size="sm">
          <Plus className="size-4 mr-2" /> New Tag
        </Button>
      }
    />
  );

  return (
    <ModuleShell
      title="Tags"
      icon={TagIcon}
      meta="Create, edit, merge, and delete tags"
      primaryAction={tagsSettingsPrimaryAction}
      filterBar={filterBar}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="contact">Contacts</TabsTrigger>
          <TabsTrigger value="company">Companies</TabsTrigger>
          <TabsTrigger value="deal">Deals</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={`skeleton-${i}`} className="h-20" />)}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TagIcon className="size-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No tags found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(tag => (
                <TagItem
                  key={tag._id}
                  tag={tag}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMerge={handleMergeOpen}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={(open) => dispatchMerge({ type: 'setOpen', open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Tag</DialogTitle>
            <DialogDescription>
              All records tagged with <strong>&quot;{mergeSourceTag?.name}&quot;</strong> will be retagged
              with the selected target tag, then <strong>&quot;{mergeSourceTag?.name}&quot;</strong> will be
              deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Merge into</Label>
            <Select value={mergeTargetId} onValueChange={(targetId) => dispatchMerge({ type: 'setTargetId', targetId })}>
              <SelectTrigger>
                <SelectValue placeholder="Select target tag..." />
              </SelectTrigger>
              <SelectContent>
                {mergeTargetOptions.map(t => (
                  <SelectItem key={t._id} value={t._id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 rounded-full shrink-0"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => dispatchMerge({ type: 'setOpen', open: false })} disabled={merging}>
              Cancel
            </Button>
            <Button
              onClick={handleMergeConfirm}
              disabled={!mergeTargetId || merging}
              variant="destructive"
            >
              {merging ? 'Merging...' : 'Merge & Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleShell>
  );
}
