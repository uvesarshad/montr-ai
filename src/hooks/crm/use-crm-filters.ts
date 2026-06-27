'use client';

import { useState, useCallback } from 'react';

export interface FilterState {
  [key: string]: unknown;
}

export interface UseCrmFiltersResult {
  filters: FilterState;
  setFilter: (key: string, value: unknown) => void;
  removeFilter: (key: string) => void;
  clearFilters: () => void;
  hasFilters: boolean;
  activeFilterCount: number;
}

/**
 * Hook for managing filter state in CRM list views
 * Provides utilities to set, remove, and clear filters
 */
export function useCrmFilters(initialFilters: FilterState = {}): UseCrmFiltersResult {
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  const setFilter = useCallback((key: string, value: unknown) => {
    setFilters((prev) => {
      // Remove filter if value is null, undefined, or empty string
      if (value === null || value === undefined || value === '') {
        const newFilters = { ...prev };
        delete newFilters[key];
        return newFilters;
      }

      // Remove filter if value is empty array
      if (Array.isArray(value) && value.length === 0) {
        const newFilters = { ...prev };
        delete newFilters[key];
        return newFilters;
      }

      return {
        ...prev,
        [key]: value,
      };
    });
  }, []);

  const removeFilter = useCallback((key: string) => {
    setFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  // Count non-pagination filters
  const activeFilterCount = Object.keys(filters).filter(
    (key) => !['page', 'limit', 'sort'].includes(key)
  ).length;

  const hasFilters = activeFilterCount > 0;

  return {
    filters,
    setFilter,
    removeFilter,
    clearFilters,
    hasFilters,
    activeFilterCount,
  };
}
