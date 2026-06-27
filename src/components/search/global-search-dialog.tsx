'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Loader2,
  User,
  Building2,
  Handshake,
  Activity,
  File,
  BookText,
  ClipboardList,
  Sparkles,
} from 'lucide-react';

type ResultType =
  | 'contact'
  | 'company'
  | 'deal'
  | 'activity'
  | 'canvas'
  | 'document'
  | 'brand'
  | 'form';

interface GlobalSearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const TYPE_META: Record<
  ResultType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  contact: { label: 'Contacts', icon: User },
  company: { label: 'Companies', icon: Building2 },
  deal: { label: 'Deals', icon: Handshake },
  activity: { label: 'Activities', icon: Activity },
  canvas: { label: 'Canvases', icon: File },
  document: { label: 'Notes', icon: BookText },
  brand: { label: 'Brands', icon: Sparkles },
  form: { label: 'Forms', icon: ClipboardList },
};

const GROUP_ORDER: ResultType[] = [
  'contact',
  'company',
  'deal',
  'activity',
  'canvas',
  'document',
  'form',
  'brand',
];

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: GlobalSearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [results, setResults] = React.useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
      setResults([]);
      setError(null);
    }
  }, [open]);

  // Debounce input
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch results
  React.useEffect(() => {
    if (!open) return;
    if (debounced.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/v2/search?q=${encodeURIComponent(debounced)}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        setResults(data.results || []);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Search failed');
        setResults([]);
        setLoading(false);
      });

    return () => controller.abort();
  }, [debounced, open]);

  const grouped = React.useMemo(() => {
    const out: Record<ResultType, GlobalSearchResult[]> = {
      contact: [],
      company: [],
      deal: [],
      activity: [],
      canvas: [],
      document: [],
      brand: [],
      form: [],
    };
    for (const r of results) out[r.type].push(r);
    return out;
  }, [results]);

  const handleSelect = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const showEmpty =
    !loading && !error && debounced.length >= 2 && results.length === 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search contacts, companies, deals, canvases, notes…"
      />
      <CommandList>
        {debounced.length < 2 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search.
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Searching…
          </div>
        )}

        {error && (
          <div className="py-6 text-center text-sm text-destructive">
            {error}
          </div>
        )}

        {showEmpty && <CommandEmpty>No results for &quot;{debounced}&quot;.</CommandEmpty>}

        {!loading &&
          !error &&
          GROUP_ORDER.map((type, idx) => {
            const items = grouped[type];
            if (!items?.length) return null;
            const meta = TYPE_META[type];
            const Icon = meta.icon;

            return (
              <React.Fragment key={type}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={meta.label}>
                  {items.map((r) => (
                    <CommandItem
                      key={`${r.type}-${r.id}`}
                      value={`${r.type}-${r.id}-${r.title}`}
                      onSelect={() => handleSelect(r.href)}
                    >
                      <Icon className="text-muted-foreground" />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{r.title}</span>
                        {r.subtitle && (
                          <span className="truncate text-xs text-muted-foreground">
                            {r.subtitle}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            );
          })}
      </CommandList>
    </CommandDialog>
  );
}
