'use client';

import { useState, useEffect, useCallback } from 'react';
import { Contact } from '@/types/crm';
import { CreateContactInput, UpdateContactInput } from '@/validations/crm/contact.schema';

export interface UseContactResult {
  contact: Contact | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateContact: (data: UpdateContactInput) => Promise<Contact>;
  deleteContact: () => Promise<void>;
  createContact: (data: CreateContactInput) => Promise<Contact>;
}

export function useContact(id?: string): UseContactResult {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);

  const fetchContact = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/contacts/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 404) {
          throw new Error('Contact not found');
        }
        throw new Error('Failed to fetch contact');
      }

      const data = await response.json();
      setContact(data);
    } catch (err) {
      console.error('Error fetching contact:', err);
      setError(err instanceof Error ? err.message : 'Failed to load contact');
      setContact(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  const createContact = useCallback(async (data: CreateContactInput): Promise<Contact> => {
    try {
      const response = await fetch('/api/v2/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create contact');
      }

      const newContact = await response.json();
      setContact(newContact);
      return newContact;
    } catch (err) {
      console.error('Error creating contact:', err);
      throw err instanceof Error ? err : new Error('Failed to create contact');
    }
  }, []);

  const updateContact = useCallback(
    async (data: UpdateContactInput): Promise<Contact> => {
      if (!id) {
        throw new Error('No contact ID provided');
      }

      try {
        const response = await fetch(`/api/v2/crm/contacts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update contact');
        }

        const updatedContact = await response.json();
        setContact(updatedContact);
        return updatedContact;
      } catch (err) {
        console.error('Error updating contact:', err);
        throw err instanceof Error ? err : new Error('Failed to update contact');
      }
    },
    [id]
  );

  const deleteContact = useCallback(async (): Promise<void> => {
    if (!id) {
      throw new Error('No contact ID provided');
    }

    try {
      const response = await fetch(`/api/v2/crm/contacts/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete contact');
      }

      setContact(null);
    } catch (err) {
      console.error('Error deleting contact:', err);
      throw err instanceof Error ? err : new Error('Failed to delete contact');
    }
  }, [id]);

  return {
    contact,
    loading,
    error,
    refetch: fetchContact,
    updateContact,
    deleteContact,
    createContact,
  };
}
