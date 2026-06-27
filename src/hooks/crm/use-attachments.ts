'use client';

import { useState, useEffect, useCallback } from 'react';
import { Attachment } from '@/types/crm';

export interface AttachmentFilters {
  targetType: string;
  targetId: string;
}

export interface UseAttachmentsResult {
  attachments: Attachment[];
  loading: boolean;
  error: string | null;
  uploading: boolean;
  refetch: () => Promise<void>;
  uploadAttachment: (
    file: File,
    targetType: string,
    targetId: string,
    description?: string
  ) => Promise<Attachment>;
  deleteAttachment: (id: string) => Promise<void>;
  updateAttachment: (id: string, description: string) => Promise<Attachment>;
}

export function useAttachments(filters: AttachmentFilters): UseAttachmentsResult {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAttachments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();
      params.append('targetType', filters.targetType);
      params.append('targetId', filters.targetId);

      const queryString = params.toString();
      const url = `/api/v2/crm/attachments?${queryString}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch attachments');
      }

      const data = await response.json();
      setAttachments(data.data || data || []);
    } catch (err) {
      console.error('Error fetching attachments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load attachments');
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const uploadAttachment = useCallback(
    async (
      file: File,
      targetType: string,
      targetId: string,
      description?: string
    ): Promise<Attachment> => {
      try {
        setUploading(true);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('targetType', targetType);
        formData.append('targetId', targetId);
        if (description) {
          formData.append('description', description);
        }

        const response = await fetch('/api/v2/crm/attachments', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to upload attachment');
        }

        const newAttachment = await response.json();
        setAttachments((prev) => [newAttachment, ...prev]);
        return newAttachment;
      } catch (err) {
        console.error('Error uploading attachment:', err);
        throw err instanceof Error ? err : new Error('Failed to upload attachment');
      } finally {
        setUploading(false);
      }
    },
    []
  );

  const updateAttachment = useCallback(
    async (id: string, description: string): Promise<Attachment> => {
      try {
        const response = await fetch(`/api/v2/crm/attachments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ description }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update attachment');
        }

        const updatedAttachment = await response.json();
        setAttachments((prev) =>
          prev.map((att) => (att._id === id ? updatedAttachment : att))
        );
        return updatedAttachment;
      } catch (err) {
        console.error('Error updating attachment:', err);
        throw err instanceof Error ? err : new Error('Failed to update attachment');
      }
    },
    []
  );

  const deleteAttachment = useCallback(async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/v2/crm/attachments/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete attachment');
      }

      setAttachments((prev) => prev.filter((att) => att._id !== id));
    } catch (err) {
      console.error('Error deleting attachment:', err);
      throw err instanceof Error ? err : new Error('Failed to delete attachment');
    }
  }, []);

  return {
    attachments,
    loading,
    error,
    uploading,
    refetch: fetchAttachments,
    uploadAttachment,
    updateAttachment,
    deleteAttachment,
  };
}
