import useSWR from 'swr';
import type { CanvasTemplateSummary, CanvasTemplateDetail } from '@/lib/canvas/template-catalog';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch canvas templates');
  }
  return response.json();
};

interface UseCanvasTemplatesOptions {
  category?: string;
  source?: 'official' | 'community';
  tags?: string;
  sort?: 'popular' | 'newest' | 'rating' | 'trending';
  featured?: boolean;
  limit?: number;
}

type CanvasTemplatesResponse = {
  templates?: CanvasTemplateSummary[];
  pagination?: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  tags?: string[];
  categories?: string[];
};

export function useCanvasTemplates(options: UseCanvasTemplatesOptions = {}) {
  const params = new URLSearchParams();
  if (options.category && options.category !== 'all') params.set('category', options.category);
  if (options.source) params.set('source', options.source);
  if (options.tags) params.set('tags', options.tags);
  if (options.sort) params.set('sort', options.sort);
  if (options.featured) params.set('featured', 'true');
  if (options.limit) params.set('limit', options.limit.toString());

  const queryString = params.toString();
  const { data, error, isLoading, mutate } = useSWR<CanvasTemplatesResponse>(
    `/api/v2/canvas-templates${queryString ? `?${queryString}` : ''}`,
    fetcher
  );

  return {
    templates: data?.templates || [],
    pagination: data?.pagination,
    tags: data?.tags || [],
    categories: data?.categories || [],
    isLoading,
    isError: error,
    refetch: mutate,
  };
}

export function useCanvasTemplate(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ template: CanvasTemplateDetail }>(
    id ? `/api/v2/canvas-templates/${id}` : null,
    fetcher
  );

  return {
    template: data?.template || null,
    isLoading,
    isError: error,
    refetch: mutate,
  };
}

export function useMyCanvasTemplates(status?: string) {
  const url = `/api/v2/canvas-templates/my${status ? `?status=${status}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<CanvasTemplatesResponse>(url, fetcher);

  return {
    templates: data?.templates || [],
    pagination: data?.pagination,
    isLoading,
    isError: error,
    refetch: mutate,
  };
}

export type { CanvasTemplateSummary, CanvasTemplateDetail };
