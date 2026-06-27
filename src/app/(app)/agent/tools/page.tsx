'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import {
  PageHeader,
  Toolbar,
  SearchInput,
  Chip,
  Card,
  Skeleton,
  EmptyState,
} from '@/components/ui-kit';
import type { ChipTone } from '@/components/ui-kit';

interface ToolEntry {
  name: string;
  description: string;
  hitlPolicy: 'always' | 'supervised' | 'never';
  scope: string;
}

const HITL_LABELS: Record<string, { label: string; tone: ChipTone }> = {
  always: { label: 'Always approval', tone: 'danger' },
  supervised: { label: 'Supervised', tone: 'warn' },
  never: { label: 'Auto', tone: 'gray' },
};

export default function ToolCatalogPage() {
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string | null>(null);

  const { data, isLoading: loading } = useQuery<{ tools?: ToolEntry[] }>({
    queryKey: ['agent-tools'],
    queryFn: async () => {
      const res = await fetch('/api/v2/agent/tools');
      return res.json();
    },
  });
  const tools = data?.tools ?? [];

  const scopes = Array.from(new Set(tools.map(t => t.scope))).sort();

  const filtered = tools.filter(t =>
    (!scopeFilter || t.scope === scopeFilter) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        icon={Wrench}
        title="Agent Tool Catalog"
        sub="All tools the agent can use, their scope, and approval policies."
      />

      <Toolbar>
        <SearchInput
          placeholder="Search tools…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          wrapClassName="w-full max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip
            tone={!scopeFilter ? 'brand' : 'gray'}
            selected={!scopeFilter}
            onClick={() => setScopeFilter(null)}
          >
            All
          </Chip>
          {scopes.map(s => (
            <Chip
              key={s}
              tone={scopeFilter === s ? 'brand' : 'gray'}
              selected={scopeFilter === s}
              onClick={() => setScopeFilter(s === scopeFilter ? null : s)}
            >
              {s}
            </Chip>
          ))}
        </div>
      </Toolbar>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No tools found"
          note="Try a different search term or scope filter."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map(tool => {
            const hitl = HITL_LABELS[tool.hitlPolicy];
            return (
              <Card key={tool.name} lift>
                <div className="space-y-2 px-4 pb-4 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[13px] font-semibold">{tool.name}</span>
                    <div className="flex shrink-0 gap-1.5">
                      <Chip tone="info">{tool.scope}</Chip>
                      <Chip tone={hitl.tone}>{hitl.label}</Chip>
                    </div>
                  </div>
                  <p className="text-[12.5px] text-muted-foreground">{tool.description}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[12px] text-muted-foreground">
        {filtered.length} of {tools.length} tools shown
      </p>
    </div>
  );
}
