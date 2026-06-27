'use client';

/**
 * Current-brand context (B3-4.6.3).
 *
 * Top-nav dropdown sets this; every brand-scoped surface reads it via
 * `useCurrentBrand()`. Persisted in a non-HttpOnly cookie so server components
 * can also read it for SSR (decoded with `cookies()` in route handlers).
 *
 * Selection model:
 *  - "all" (null brandId) → cross-brand views (admin / agency overview).
 *  - A specific brand id → all surfaces filter to that brand.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface BrandSummary {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  ownedByMe: boolean;
}

interface CurrentBrandContextValue {
  brands: BrandSummary[];
  currentBrandId: string | null; // null = "all brands" / cross-brand view
  setCurrentBrandId: (id: string | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const COOKIE_NAME = 'montrai_current_brand';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find(c => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

function writeCookie(name: string, value: string | null) {
  if (typeof document === 'undefined') return;
  const oneYear = 365 * 24 * 60 * 60;
  if (value === null) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
  } else {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${oneYear}; samesite=lax`;
  }
}

const CurrentBrandContext = createContext<CurrentBrandContextValue>({
  brands: [],
  currentBrandId: null,
  setCurrentBrandId: () => undefined,
  loading: true,
  refresh: async () => undefined,
});

export function CurrentBrandProvider({ children }: { children: React.ReactNode }) {
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [currentBrandId, setCurrentBrandIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v2/brands', { credentials: 'include' });
      if (!r.ok) {
        setBrands([]);
        return;
      }
      const data = (await r.json()) as { brands: BrandSummary[] };
      setBrands(data.brands);
    } catch {
      setBrands([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCurrentBrandIdState(readCookie(COOKIE_NAME));
    refresh();
  }, [refresh]);

  const setCurrentBrandId = useCallback((id: string | null) => {
    setCurrentBrandIdState(id);
    writeCookie(COOKIE_NAME, id);
  }, []);

  const value = useMemo(
    () => ({ brands, currentBrandId, setCurrentBrandId, loading, refresh }),
    [brands, currentBrandId, setCurrentBrandId, loading, refresh],
  );

  return <CurrentBrandContext.Provider value={value}>{children}</CurrentBrandContext.Provider>;
}

export function useCurrentBrand(): CurrentBrandContextValue {
  return useContext(CurrentBrandContext);
}
