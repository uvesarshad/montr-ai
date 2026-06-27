'use client';

import { useState } from 'react';
import { useTags } from '@/hooks/crm/use-tags';
import { ModuleShell } from '@/components/shell/module-shell';
import { CreateTagDialog } from '@/components/crm/tags/create-tag-dialog';
import { TagItem } from '@/components/crm/tags/tag-item';
import { Tag } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag as TagIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function TagsPage() {
  const { toast } = useToast();
  const [editingTag, setEditingTag] = useState<Tag | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  const { tags, loading, error, refetch, deleteTag } = useTags({
    type: activeTab === 'all' ? undefined : activeTab,
    limit: 100,
  });

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setDialogOpen(true);
  };

  const handleDelete = async (tag: Tag) => {
    if (!confirm(`Are you sure you want to delete the tag "${tag.name}"?`)) {
      return;
    }

    try {
      await deleteTag(tag._id);
      toast({
        title: 'Tag deleted',
        description: 'The tag has been successfully deleted.',
      });
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete tag. Please try again.',
      });
    }
  };

  const handleMerge = (_tag: Tag) => {
    toast({
      title: 'Merge Tags',
      description: 'Tag merge feature will be available soon.',
    });
  };

  const tagsPrimaryAction = (
    <CreateTagDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      onSuccess={() => {
        refetch();
        setEditingTag(undefined);
      }}
      tag={editingTag}
    />
  );

  return (
    <ModuleShell
      title="Tags"
      icon={TagIcon}
      meta={tags.length > 0 ? `${tags.length} total` : 'Organize your CRM records with tags'}
      primaryAction={tagsPrimaryAction}
      error={error ? { title: 'Error loading tags', message: error, onRetry: refetch } : null}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Tags</TabsTrigger>
          <TabsTrigger value="contact">Contacts</TabsTrigger>
          <TabsTrigger value="company">Companies</TabsTrigger>
          <TabsTrigger value="deal">Deals</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={`skeleton-${i}`} className="h-32 w-full" />
              ))}
            </div>
          ) : tags.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-border bg-card">
              <div className="rounded-full bg-muted p-4 mb-4">
                <TagIcon className="size-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No tags found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {activeTab === 'all'
                  ? 'Create your first tag to start organizing your CRM records'
                  : `No tags found for ${activeTab}s`}
              </p>
              <CreateTagDialog
                trigger={
                  <button type="button" className="mt-4 text-sm text-primary hover:underline">
                    Create your first tag
                  </button>
                }
                onSuccess={() => {
                  refetch();
                }}
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tags.map((tag) => (
                <TagItem
                  key={tag._id}
                  tag={tag}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMerge={handleMerge}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ModuleShell>
  );
}
