'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  LayoutGrid,
  Layers3,
  List,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  Workflow,
  Zap,
} from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { useAppHeader } from '@/components/app-header';
import { useCanvases } from '@/hooks/use-canvases-v2';
import { useCanvasScheduleInfo } from '@/hooks/use-canvas-schedule-info';
import { useCanvasTemplates, type CanvasTemplateSummary } from '@/hooks/use-canvas-templates';
import { CanvasCard } from '@/components/canvas-card';
import { CanvasListRow } from '@/components/canvas/canvas-list-row';
import { openAgentLauncher } from '@/lib/agent/launcher';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  KpiTile,
  Segmented,
  SearchInput,
  Select,
  Skeleton,
  Spinner,
  Toolbar,
  type KpiTileProps,
} from '@/components/ui-kit';

function formatLabel(value?: string) {
  if (!value) return 'General';
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const TEMPLATE_PASTELS = ['violet', 'blue', 'mint', 'peach'] as const;

function CanvasStatTiles({ isLoading, statTiles }: { isLoading: boolean; statTiles: KpiTileProps[] }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={`stat-skeleton-${index}`} bodyClassName="p-4">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="mt-4 h-7 w-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {statTiles.map((tile, i) => (
        <KpiTile key={i} {...tile} />
      ))}
    </div>
  );
}

export default function CanvasesPage() {
  const { push } = useRouter();
  const { data: session } = useSession();
  const { toast } = useToast();
  const { setHeaderInfo } = useAppHeader();
  const [sortBy, setSortBy] = useState<'updatedAt' | 'name'>('updatedAt');
  const [selectedCanvases, setSelectedCanvases] = useState<string[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingBlank, setIsCreatingBlank] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);

  const { canvases, isLoading, deleteCanvas, updateCanvas, createCanvas, error } = useCanvases(sortBy);
  const scheduleInfo = useCanvasScheduleInfo();
  const { templates: canvasTemplates, isLoading: isTemplatesLoading } = useCanvasTemplates();

  const filteredCanvases = useMemo(() => {
    if (!canvases) return [];
    if (!searchQuery) return canvases;

    return canvases.filter((canvas) => canvas.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [canvases, searchQuery]);

  const totalAutomations = canvases?.length || 0;
  const activeAutomations = canvases?.filter((canvas) => canvas.stats?.isActive).length || 0;
  const totalExecutions =
    canvases?.reduce((sum, canvas) => sum + (canvas.stats?.executionCount || 0), 0) || 0;
  const averageExecutions = totalAutomations > 0 ? Math.round(totalExecutions / totalAutomations) : 0;
  const draftAutomations = Math.max(totalAutomations - activeAutomations, 0);
  const recommendedTemplates = canvasTemplates.slice(0, 4);

  const handleDeleteSelected = useCallback(async () => {
    if (!session || selectedCanvases.length === 0) return;

    try {
      await Promise.all(selectedCanvases.map((id) => deleteCanvas(id)));

      toast({
        title: `${selectedCanvases.length} automations deleted`,
        description: 'The selected automations have been permanently removed.',
      });

      setSelectedCanvases([]);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete automations. Please try again.',
        variant: 'destructive',
      });
      throw new Error('delete failed');
    }
  }, [deleteCanvas, selectedCanvases, session, toast]);

  const handleRename = useCallback(
    async (canvasId: string, newName: string) => {
      try {
        await updateCanvas(canvasId, { name: newName });
      } catch (renameError) {
        console.error('Failed to update canvas name in local state:', renameError);
      }
    },
    [updateCanvas],
  );

  const handleCreateBlank = useCallback(async () => {
    if (!session || isCreatingBlank) return;

    try {
      setIsCreatingBlank(true);
      const newCanvas = await createCanvas(
        'Untitled Automation',
        JSON.stringify({ nodes: [], edges: [] }),
      );
      push(`/canvas/${newCanvas._id}`);
    } catch (createError) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: getErrorMessage(createError, 'Failed to create automation.'),
      });
      setIsCreatingBlank(false);
    }
  }, [createCanvas, isCreatingBlank, push, session, toast]);

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'Automation',
      description: 'Workflow library',
      actions: (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Sparkles}
            onClick={() =>
              openAgentLauncher({
                prompt:
                  'Review this automation library and suggest the next highest-leverage missions, cleanup work, or workflow opportunities I should prioritize.',
                context: {
                  source: 'canvas_library',
                  entityType: 'automation_library',
                  entityLabel: 'Canvas workspace',
                  route: '/canvas',
                  notes: [
                    `Saved automations: ${canvases?.length || 0}`,
                    `Active automations: ${canvases?.filter((canvas) => canvas.stats?.isActive).length || 0}`,
                    `Total executions: ${(canvases || []).reduce((sum, canvas) => sum + (canvas.stats?.executionCount || 0), 0)}`,
                    canvases?.[0]?.name ? `Most recent automation: ${canvases[0].name}` : 'No automations yet',
                    searchQuery ? `Search filter: ${searchQuery}` : 'No search filter applied',
                  ],
                },
              })
            }
          >
            Ask Agent
          </Button>
          <Button
            variant="brand"
            size="sm"
            icon={isCreatingBlank ? undefined : Plus}
            disabled={isCreatingBlank}
            onClick={handleCreateBlank}
          >
            {isCreatingBlank ? <Spinner size={13} className="border-current" /> : null}
            New Automation
          </Button>
        </div>
      ),
    });
  }, [canvases, handleCreateBlank, isCreatingBlank, searchQuery, setHeaderInfo]);

  const handleSelectCanvas = (canvasId: string, isSelected: boolean | 'indeterminate') => {
    if (isSelected === true) {
      setSelectedCanvases((prev) => (prev.includes(canvasId) ? prev : [...prev, canvasId]));
      return;
    }

    setSelectedCanvases((prev) => prev.filter((id) => id !== canvasId));
  };

  const handleCreateFromTemplate = async (template: CanvasTemplateSummary) => {
    if (!session) return;

    try {
      setCreatingTemplateId(template._id);

      const response = await fetch(`/api/v2/canvas-templates/${template._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ canvasName: `${template.name} (Copy)` }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create automation from template.');
      }

      const result = await response.json();

      toast({
        title: 'Template created',
        description: `Created automation from "${template.name}".`,
      });

      push(`/canvas/${result.canvas.id}`);
    } catch (createError) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: getErrorMessage(createError, 'Failed to create automation from template.'),
      });
      setCreatingTemplateId(null);
    }
  };

  const statTiles: KpiTileProps[] = [
    {
      icon: Workflow,
      label: 'Saved',
      value: totalAutomations.toLocaleString('en-US'),
      delta: activeAutomations > 0 ? `${activeAutomations} live` : undefined,
      up: activeAutomations > 0,
      iconTone: 'brand',
    },
    {
      icon: Zap,
      label: 'Live',
      value: activeAutomations.toLocaleString('en-US'),
      delta: `${draftAutomations} idle`,
      up: activeAutomations > 0,
      iconTone: 'ok',
    },
    {
      icon: Sparkles,
      label: 'Executions',
      value: totalExecutions.toLocaleString('en-US'),
      delta: `${averageExecutions.toLocaleString('en-US')} avg`,
      up: totalExecutions > 0,
      iconTone: 'info',
    },
    {
      icon: Layers3,
      label: 'Templates',
      value: canvasTemplates.length.toLocaleString('en-US'),
      iconTone: 'warn',
    },
  ];

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertTriangle}
          title="Error loading automations"
          note={error.message}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <CanvasStatTiles isLoading={isLoading} statTiles={statTiles} />

      <Card
        icon={Layers3}
        title="Start from Templates"
        meta="proven workflow patterns"
        action={
          <Link href="/canvas/templates">
            <Button variant="ghost" size="sm" iconRight={ArrowRight}>
              Browse all
            </Button>
          </Link>
        }
        bodyClassName="px-4 pb-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <button
            type="button"
            onClick={handleCreateBlank}
            disabled={isCreatingBlank}
            className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-input bg-card p-3.5 text-left transition hover:border-brand hover:bg-brand-muted/30 disabled:opacity-60"
          >
            <span className="grid size-8 place-items-center rounded-md bg-brand-muted text-brand-strong">
              {isCreatingBlank ? <Spinner size={14} /> : <Plus className="size-4" />}
            </span>
            <div>
              <p className="text-[13px] font-semibold text-foreground">Blank Automation</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                Open a clean canvas and wire the workflow yourself.
              </p>
            </div>
          </button>

          {isTemplatesLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <Card key={`tpl-skeleton-${index}`} bodyClassName="p-3.5">
                  <Skeleton className="size-6 rounded-md" />
                  <Skeleton className="mt-4 h-4 w-24" />
                  <Skeleton className="mt-2 h-3 w-full" />
                </Card>
              ))
            : recommendedTemplates.map((template, index) => (
                <button
                  key={template._id}
                  type="button"
                  onClick={() => handleCreateFromTemplate(template)}
                  disabled={Boolean(creatingTemplateId)}
                  className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-3.5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-input hover:shadow-card-hover disabled:opacity-60"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="grid size-8 place-items-center rounded-md bg-brand-muted text-brand-strong">
                      {creatingTemplateId === template._id ? <Spinner size={14} /> : <Wand2 className="size-4" />}
                    </span>
                    <Chip tone={TEMPLATE_PASTELS[index % TEMPLATE_PASTELS.length] === 'violet' ? 'brand' : 'gray'}>
                      {formatLabel(template.category)}
                    </Chip>
                  </div>
                  <p className="text-[13px] font-semibold text-foreground">{template.name}</p>
                  <p className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{template.description}</p>
                  <div className="mt-auto flex w-full items-center justify-between pt-1 text-[11px] text-muted-foreground">
                    <span>{template.stepCount || 0} steps</span>
                    <span className="font-semibold text-brand-strong">Use →</span>
                  </div>
                </button>
              ))}
        </div>
      </Card>

      <Card bodyClassName="p-3.5">
        <Toolbar
          right={
            <>
              <Select
                value={sortBy}
                onChange={(v) => setSortBy(v as 'updatedAt' | 'name')}
                options={[
                  { value: 'updatedAt', label: 'Last modified' },
                  { value: 'name', label: 'Name' },
                ]}
                triggerClassName="w-[150px]"
                aria-label="Sort automations"
              />
              <Segmented
                value={view}
                onChange={(v) => setView(v as 'grid' | 'list')}
                options={[
                  { value: 'grid', label: <LayoutGrid className="size-3.5" /> },
                  { value: 'list', label: <List className="size-3.5" /> },
                ]}
              />
            </>
          }
        >
          {selectedCanvases.length > 0 ? (
            <div className="flex items-center gap-2">
              <Chip tone="brand">{selectedCanvases.length} selected</Chip>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                className="text-danger hover:text-danger"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCanvases([])}>
                Clear
              </Button>
            </div>
          ) : (
            <SearchInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search automations…"
              wrapClassName="w-[260px]"
            />
          )}
        </Toolbar>

        <div className="mt-3.5">
          {isLoading ? (
            view === 'grid' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Card key={`canvas-grid-skeleton-${index}`} bodyClassName="p-0">
                    <Skeleton className="aspect-[16/9] rounded-none" />
                    <div className="p-4">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="mt-2 h-3 w-1/3" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={`canvas-list-skeleton-${index}`} className="h-14 w-full rounded-[10px]" />
                ))}
              </div>
            )
          ) : filteredCanvases.length > 0 ? (
            view === 'grid' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredCanvases.map((canvas) => (
                  <CanvasCard
                    key={canvas._id}
                    canvas={canvas}
                    schedule={scheduleInfo[canvas._id]}
                    isSelected={selectedCanvases.includes(canvas._id)}
                    onSelect={(checked) => handleSelectCanvas(canvas._id, checked)}
                    onRename={handleRename}
                    onDeleteSuccess={deleteCanvas}
                    showSelection
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filteredCanvases.map((canvas) => (
                  <CanvasListRow
                    key={canvas._id}
                    canvas={canvas}
                    schedule={scheduleInfo[canvas._id]}
                    isSelected={selectedCanvases.includes(canvas._id)}
                    onSelect={(checked) => handleSelectCanvas(canvas._id, checked)}
                    onRename={handleRename}
                    onDeleteSuccess={deleteCanvas}
                  />
                ))}
              </div>
            )
          ) : (
            <EmptyState
              icon={searchQuery ? Clock3 : Workflow}
              title={searchQuery ? 'No matching automations' : 'No automations yet'}
              note={
                searchQuery
                  ? 'Try a different search term or switch the sort to surface the workflow you need.'
                  : 'Create a blank automation or launch one of the starter templates above to populate the workspace.'
              }
              cta={
                !searchQuery ? (
                  <Button variant="brand" size="sm" icon={Plus} onClick={handleCreateBlank}>
                    New automation
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete selected automations?"
        description={`This action cannot be undone. It will permanently remove the ${selectedCanvases.length} selected automation${selectedCanvases.length === 1 ? '' : 's'}.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteSelected}
      />
    </div>
  );
}
