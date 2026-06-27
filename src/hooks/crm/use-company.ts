'use client';

import { useState, useEffect, useCallback } from 'react';
import { Company } from '@/types/crm';
import { CreateCompanyInput, UpdateCompanyInput } from '@/validations/crm/company.schema';

export interface UseCompanyResult {
  company: Company | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateCompany: (data: UpdateCompanyInput) => Promise<Company>;
  deleteCompany: () => Promise<void>;
  createCompany: (data: CreateCompanyInput) => Promise<Company>;
}

export function useCompany(id?: string): UseCompanyResult {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);

  const fetchCompany = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/companies/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 404) {
          throw new Error('Company not found');
        }
        throw new Error('Failed to fetch company');
      }

      const data = await response.json();
      setCompany(data);
    } catch (err) {
      console.error('Error fetching company:', err);
      setError(err instanceof Error ? err.message : 'Failed to load company');
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const createCompany = useCallback(async (data: CreateCompanyInput): Promise<Company> => {
    try {
      const response = await fetch('/api/v2/crm/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create company');
      }

      const newCompany = await response.json();
      setCompany(newCompany);
      return newCompany;
    } catch (err) {
      console.error('Error creating company:', err);
      throw err instanceof Error ? err : new Error('Failed to create company');
    }
  }, []);

  const updateCompany = useCallback(
    async (data: UpdateCompanyInput): Promise<Company> => {
      if (!id) {
        throw new Error('No company ID provided');
      }

      try {
        const response = await fetch(`/api/v2/crm/companies/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update company');
        }

        const updatedCompany = await response.json();
        setCompany(updatedCompany);
        return updatedCompany;
      } catch (err) {
        console.error('Error updating company:', err);
        throw err instanceof Error ? err : new Error('Failed to update company');
      }
    },
    [id]
  );

  const deleteCompany = useCallback(async (): Promise<void> => {
    if (!id) {
      throw new Error('No company ID provided');
    }

    try {
      const response = await fetch(`/api/v2/crm/companies/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete company');
      }

      setCompany(null);
    } catch (err) {
      console.error('Error deleting company:', err);
      throw err instanceof Error ? err : new Error('Failed to delete company');
    }
  }, [id]);

  return {
    company,
    loading,
    error,
    refetch: fetchCompany,
    updateCompany,
    deleteCompany,
    createCompany,
  };
}
