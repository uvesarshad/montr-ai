'use client';

import { useEffect, useState } from 'react';
import {
  defaultLayoutFor,
  mergeLayout,
  type RecordLayoutEntityType,
  type RecordLayoutSection,
} from '@/components/crm/shared/record-layout-sections';

const cacheKey = (entityType: RecordLayoutEntityType) => `crm:record-layout:${entityType}`;

interface UseRecordLayout {
  /** Effective sections (saved merged with catalog, or defaults). */
  sections: RecordLayoutSection[];
  loading: boolean;
}

/**
 * Fetches an org's record-detail layout for an entity, with a sessionStorage
 * cache so detail-page navigation doesn't re-hit the API every time. Falls back
 * to the catalog default layout on any failure (the page always renders).
 */
export function useRecordLayout(entityType: RecordLayoutEntityType): UseRecordLayout {
  const [sections, setSections] = useState<RecordLayoutSection[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = window.sessionStorage.getItem(cacheKey(entityType));
        if (cached) return mergeLayout(entityType, JSON.parse(cached));
      } catch {
        /* ignore */
      }
    }
    return defaultLayoutFor(entityType);
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/v2/crm/record-layouts?entityType=${entityType}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        const merged = mergeLayout(entityType, data.sections);
        if (cancelled) return;
        setSections(merged);
        try {
          window.sessionStorage.setItem(cacheKey(entityType), JSON.stringify(data.sections));
        } catch {
          /* ignore quota */
        }
      } catch {
        if (!cancelled) setSections(defaultLayoutFor(entityType));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  return { sections, loading };
}
