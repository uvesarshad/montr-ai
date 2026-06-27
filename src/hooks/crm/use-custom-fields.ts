'use client';

import { useState, useEffect, useCallback } from 'react';
import { CustomField } from '@/types/crm';
import { CreateCustomFieldInput, UpdateCustomFieldInput } from '@/validations/crm/custom-field.schema';

export interface CustomFieldFilters {
  entityType?: string;
  isActive?: boolean;
}

export interface UseCustomFieldsResult {
  customFields: CustomField[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createCustomField: (data: CreateCustomFieldInput) => Promise<CustomField>;
  updateCustomField: (id: string, data: UpdateCustomFieldInput) => Promise<CustomField>;
  deleteCustomField: (id: string) => Promise<void>;
  reorderCustomFields: (fieldIds: string[]) => Promise<void>;
}

export function useCustomFields(filters?: CustomFieldFilters): UseCustomFieldsResult {
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomFields = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();

      if (filters?.entityType) params.append('entityType', filters.entityType);
      if (filters?.isActive !== undefined) {
        params.append('isActive', filters.isActive.toString());
      }

      const queryString = params.toString();
      const url = `/api/v2/crm/custom-fields${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch custom fields');
      }

      const data = await response.json();
      setCustomFields(data.data || data || []);
    } catch (err) {
      console.error('Error fetching custom fields:', err);
      setError(err instanceof Error ? err.message : 'Failed to load custom fields');
      setCustomFields([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchCustomFields();
  }, [fetchCustomFields]);

  const createCustomField = useCallback(
    async (data: CreateCustomFieldInput): Promise<CustomField> => {
      try {
        const response = await fetch('/api/v2/crm/custom-fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create custom field');
        }

        const newField = await response.json();
        setCustomFields((prev) => [...prev, newField]);
        return newField;
      } catch (err) {
        console.error('Error creating custom field:', err);
        throw err instanceof Error ? err : new Error('Failed to create custom field');
      }
    },
    []
  );

  const updateCustomField = useCallback(
    async (id: string, data: UpdateCustomFieldInput): Promise<CustomField> => {
      try {
        const response = await fetch(`/api/v2/crm/custom-fields/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update custom field');
        }

        const updatedField = await response.json();
        setCustomFields((prev) =>
          prev.map((field) => (field._id === id ? updatedField : field))
        );
        return updatedField;
      } catch (err) {
        console.error('Error updating custom field:', err);
        throw err instanceof Error ? err : new Error('Failed to update custom field');
      }
    },
    []
  );

  const deleteCustomField = useCallback(async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/v2/crm/custom-fields/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete custom field');
      }

      setCustomFields((prev) => prev.filter((field) => field._id !== id));
    } catch (err) {
      console.error('Error deleting custom field:', err);
      throw err instanceof Error ? err : new Error('Failed to delete custom field');
    }
  }, []);

  const reorderCustomFields = useCallback(
    async (fieldIds: string[]): Promise<void> => {
      try {
        const response = await fetch('/api/v2/crm/custom-fields/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fieldIds }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to reorder custom fields');
        }

        await fetchCustomFields();
      } catch (err) {
        console.error('Error reordering custom fields:', err);
        throw err instanceof Error ? err : new Error('Failed to reorder custom fields');
      }
    },
    [fetchCustomFields]
  );

  return {
    customFields,
    loading,
    error,
    refetch: fetchCustomFields,
    createCustomField,
    updateCustomField,
    deleteCustomField,
    reorderCustomFields,
  };
}
