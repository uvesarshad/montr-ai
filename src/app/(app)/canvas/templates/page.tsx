'use client';

import Link from 'next/link';
import Image from 'next/image';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Download,
  LayoutGrid,
  List,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAppHeader } from '@/components/app-header';
import { AIWorkflowDialog } from '@/components/canvas/dialogs/ai-workflow-dialog';
import { useCanvases } from '@/hooks/use-canvases-v2';
import { openAgentLauncher } from '@/lib/agent/launcher';
import { VerifiedBadge } from '@/components/canvas/templates/verified-badge';
import { TemplateRating } from '@/components/canvas/templates/template-rating';
import {
  Banner,
  Button,
  Card,
  Chip,
  type ChipTone,
  EmptyState,
  SearchInput,
  Segmented,
  Skeleton,
  Spinner,
  Toolbar,
} from '@/components/ui-kit';
import useSWR from 'swr';
import type { CanvasTemplateSummary } from '@/lib/canvas/template-catalog';

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

function formatLabel(value?: string) {
  if (!value) return 'General';
  return value.split(/[_-]/g).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function difficultyTone(difficulty?: string): ChipTone {
  switch (difficulty) {
    case 'advanced': return 'danger';
    case 'intermediate': return 'warn';
    default: return 'ok';
  }
}

interface TemplatesApiResponse {
  templates: CanvasTemplateSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  categories: string[];
  difficulties: string[];
  tags: string[];
}

const SORTS = [
  { value: 'popular', label: 'Popular', Icon: TrendingUp },
  { value: 'rating', label: 'Top rated', Icon: Star },
  { value: 'newest', label: 'Newest', Icon: Clock3 },
];

function FeaturedTemplatesRow({ templates }: { templates: CanvasTemplateSummary[] }) {
  return (
    <Card icon={Star} title="Featured templates" meta="hand-picked high-impact starters" bodyClassName="px-4 pb-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {templates.map((t) => (
          <Link key={t._id} href={`/canvas/templates/${t._id}`}>
            <Card lift spotlight bodyClassName="flex h-full flex-col p-3">
              <div className="mb-2 flex items-start justify-between gap-1.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-brand-muted text-brand-strong">
                  <Workflow className="size-3.5" />
                </span>
                {t.isOfficial && <VerifiedBadge />}
              </div>
              <p className="line-clamp-1 text-[12px] font-semibold text-foreground">{t.name}</p>
              <p className="mt-0.5 line-clamp-2 flex-1 text-[11px] text-muted-foreground">{t.description}</p>
              <div className="mt-2 flex items-center justify-between">
                <TemplateRating rating={t.rating} size="sm" />
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Download className="size-2.5" />{t.usageCount.toLocaleString()}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Card>
  );
}

export default function CanvasTemplatesPage() {
  const { setHeaderInfo } = useAppHeader();
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { createCanvas } = useCanvases();

  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || '');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'official' | 'community'>('all');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || 'all');
  const [tagFilter, setTagFilter] = useState(searchParams.get('tags') || '');
  const [sort, setSort] = useState<string>('popular');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [aiAnchorPoint, setAiAnchorPoint] = useState({ x: 0, y: 0 });
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Build query string
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set('search', debouncedSearch);
    if (categoryFilter !== 'all') p.set('category', categoryFilter);
    if (sourceFilter !== 'all') p.set('source', sourceFilter);
    if (tagFilter) p.set('tags', tagFilter);
    p.set('sort', sort);
    p.set('limit', '50');
    return p.toString();
  }, [debouncedSearch, categoryFilter, sourceFilter, tagFilter, sort]);

  const { data, isLoading } = useSWR<TemplatesApiResponse>(
    `/api/v2/canvas-templates?${queryString}`,
    fetcher
  );

  // Featured query (always popular featured)
  const { data: featuredData } = useSWR<TemplatesApiResponse>(
    '/api/v2/canvas-templates?featured=true&sort=popular&limit=4',
    fetcher
  );

  const templates = data?.templates || [];
  const featuredTemplates = featuredData?.templates || [];
  const allTags = data?.tags?.slice(0, 20) || [];
  const categories = data?.categories || [];

  const isFiltered = Boolean(debouncedSearch || categoryFilter !== 'all' || sourceFilter !== 'all' || tagFilter);

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'Automation Templates',
      backHref: '/canvas',
      actions: (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={Sparkles}
            onClick={() => openAgentLauncher({
              prompt: 'Review this automation template library and suggest the best templates to use or create for my use case.',
              context: { source: 'canvas_templates', entityType: 'template_library', entityLabel: 'Automation templates', route: '/canvas/templates' },
            })}
          >
            Ask Agent
          </Button>
          <Link href="/canvas/templates/my">
            <Button size="sm" variant="outline" icon={Plus}>My Templates</Button>
          </Link>
        </div>
      ),
    });
  }, [setHeaderInfo]);

  const handleInstall = async (template: CanvasTemplateSummary, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session || installingId) return;
    try {
      setInstallingId(template._id);
      const res = await fetch(`/api/v2/canvas-templates/${template._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ canvasName: `${template.name} (Copy)` }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      const result = await res.json();
      toast({ title: 'Template installed', description: `Canvas "${result.canvas.name}" ready.` });
      push(`/canvas/${result.canvas.id}`);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Install failed', description: err instanceof Error ? err.message : 'Unknown error' });
      setInstallingId(null);
    }
  };

  const handleAiWorkflowGenerated = async (result: { nodes: unknown[]; edges: unknown[] }) => {
    try {
      setIsGeneratingAi(true);
      const newCanvas = await createCanvas('AI Generated Workflow', JSON.stringify({ nodes: result.nodes || [], edges: result.edges || [], variables: [] }));
      toast({ title: 'Workflow generated' });
      push(`/canvas/${newCanvas._id}`);
    } catch {
      toast({ variant: 'destructive', title: 'Generation failed' });
      setIsGeneratingAi(false);
    }
  };

  const openAiDialog = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAiAnchorPoint({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    setIsAiDialogOpen(true);
  };

  const clearFilters = () => {
    setSearchQuery(''); setSourceFilter('all'); setCategoryFilter('all'); setTagFilter('');
  };

  return (
    <div className="flex flex-col gap-4 p-6 pb-10">
      {/* Status banner */}
      <Banner tone="brand" title="Automation Templates">
        <span className="flex flex-wrap items-center gap-3">
          <span>Community marketplace · {data?.pagination?.total ?? '—'} available · {featuredTemplates.filter((t) => t.source === 'official').length} official</span>
        </span>
      </Banner>

      {/* AI Generate card */}
      <button type="button" onClick={openAiDialog} disabled={isGeneratingAi} className="text-left">
        <Card lift className="transition-colors hover:border-brand">
          <div className="flex items-center gap-3 p-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-muted text-brand-strong">
              {isGeneratingAi ? <Spinner size={16} /> : <Sparkles className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-foreground">Generate a workflow with AI</span>
                <Chip tone="brand">AI build</Chip>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Describe the trigger, journey, and outcome — we&apos;ll produce a canvas starter you can refine immediately.
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          </div>
        </Card>
      </button>

      {/* Featured row */}
      {!isFiltered && featuredTemplates.length > 0 && (
        <FeaturedTemplatesRow templates={featuredTemplates} />
      )}

      {/* Main library */}
      <Card bodyClassName="p-3.5">
        {/* Toolbar */}
        <Toolbar
          right={
            <>
              <Segmented value={sort} onChange={setSort} options={SORTS.map((s) => ({ value: s.value, label: s.label }))} />
              <Segmented
                value={sourceFilter}
                onChange={(v) => setSourceFilter(v as 'all' | 'official' | 'community')}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'official', label: <span className="flex items-center gap-1"><BadgeCheck className="size-3" />Official</span> },
                  { value: 'community', label: 'Community' },
                ]}
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
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates…"
            wrapClassName="w-[240px]"
          />
        </Toolbar>

        {/* Category pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['all', ...categories].map((cat) => (
            <button type="button" key={cat} onClick={() => setCategoryFilter(cat)}>
              <Chip tone={categoryFilter === cat ? 'brand' : 'gray'}>
                {cat === 'all' ? 'All categories' : formatLabel(cat)}
              </Chip>
            </button>
          ))}
        </div>

        {/* Popular tags */}
        {allTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {allTags.slice(0, 12).map((tag) => (
              <button type="button" key={tag} onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}>
                <Chip tone={tagFilter === tag ? 'brand' : 'gray'} icon={Tag}>{tag}</Chip>
              </button>
            ))}
          </div>
        )}

        {/* Template grid/list */}
        <div className="mt-3.5">
          {isLoading ? (
            <div className={view === 'grid' ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-2'}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={`tpl-skeleton-${i}`} bodyClassName="p-3.5">
                  <Skeleton className="size-6 rounded-[6px]" />
                  <Skeleton className="mt-3 h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-full" />
                  <Skeleton className="mt-4 h-7 w-full rounded-[8px]" />
                </Card>
              ))}
            </div>
          ) : templates.length > 0 ? (
            view === 'grid' ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => (
                  <Link key={template._id} href={`/canvas/templates/${template._id}`}>
                    <Card lift bodyClassName="flex h-full flex-col p-3.5">
                      {/* Preview image */}
                      {template.previewImageUrl ? (
                        <div className="relative mb-3 aspect-[16/9] overflow-hidden rounded-[8px] bg-muted/40">
                          <Image src={template.previewImageUrl} alt={template.name} fill className="object-cover" unoptimized />
                        </div>
                      ) : null}

                      <div className="flex items-start justify-between gap-2">
                        <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-brand-muted text-brand-strong">
                          <Workflow className="size-4" />
                        </span>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {template.isOfficial && <VerifiedBadge />}
                          <Chip tone={difficultyTone(template.difficulty)}>{formatLabel(template.difficulty)}</Chip>
                        </div>
                      </div>

                      <div className="mt-3 flex-1">
                        <p className="text-[13px] font-semibold text-foreground">{template.name}</p>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-[1.55] text-muted-foreground">{template.description}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {template.tags.slice(0, 3).map((tag) => (
                            <Chip key={tag} tone="gray">{tag}</Chip>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        <div className="rounded-[7px] border border-border bg-muted/30 px-2 py-1.5">
                          <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Installs</p>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-foreground">
                            <Download className="size-2.5 text-muted-foreground" />
                            {template.usageCount.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-[7px] border border-border bg-muted/30 px-2 py-1.5">
                          <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Rating</p>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-foreground">
                            <Star className="size-2.5 fill-amber-400 text-amber-400" />
                            {template.rating > 0 ? template.rating.toFixed(1) : 'New'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                        <p className="min-w-0 truncate text-[11px] text-muted-foreground">{template.authorName}</p>
                        <Button
                          size="sm"
                          variant="brand"
                          iconRight={installingId === template._id ? undefined : ArrowRight}
                          disabled={!!installingId}
                          onClick={(e) => handleInstall(template, e)}
                        >
                          {installingId === template._id ? <Spinner size={13} className="border-current" /> : 'Use'}
                        </Button>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {templates.map((template) => (
                  <Link key={template._id} href={`/canvas/templates/${template._id}`}>
                    <Card lift bodyClassName="flex items-center gap-4 px-3.5 py-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-brand-muted text-brand-strong">
                        <Workflow className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-[13px] font-semibold text-foreground">{template.name}</p>
                          {template.isOfficial && <VerifiedBadge />}
                          <Chip tone={difficultyTone(template.difficulty)}>{formatLabel(template.difficulty)}</Chip>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{template.description}</p>
                      </div>
                      <div className="hidden shrink-0 items-center gap-4 text-[11px] text-muted-foreground md:flex">
                        <span className="flex items-center gap-1"><Download className="size-3" />{template.usageCount.toLocaleString()}</span>
                        <span className="flex items-center gap-1"><Star className="size-3 fill-amber-400 text-amber-400" />{template.rating > 0 ? template.rating.toFixed(1) : 'New'}</span>
                        <span>{template.authorName}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="brand"
                        disabled={!!installingId}
                        onClick={(e) => handleInstall(template, e)}
                      >
                        {installingId === template._id ? <Spinner size={13} className="border-current" /> : 'Use'}
                      </Button>
                    </Card>
                  </Link>
                ))}
              </div>
            )
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="No templates match these filters"
              note="Try a different search term, remove a tag filter, or clear the category."
              cta={<Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
            />
          )}
        </div>
      </Card>

      <AIWorkflowDialog
        open={isAiDialogOpen}
        onOpenChange={setIsAiDialogOpen}
        onWorkflowGenerated={handleAiWorkflowGenerated}
        isCollapsed={false}
        anchorPoint={aiAnchorPoint}
      />
    </div>
  );
}
