import useSWR from 'swr';
import { fetcher } from '@/lib/utils';

// Plain data shape returned by the API (JSON serialised — _id is always a string)
export interface IFormData {
    _id: string;
    userId: string;
    title: string;
    content: string;
    isPublished: boolean;
    slug: string;
    views: number;
    submissionsCount: number;
    linkedDocId?: string;
    isPasswordProtected?: boolean;
    settings: {
        theme?: string;
        emailNotifications?: boolean;
        notificationEmail?: string;
        description?: string;
        submitButtonText?: string;
        thankYouMessage?: string;
        thankYouUrl?: string;
        crmIntegration?: {
            enabled: boolean;
            fieldMap: {
                firstName?: string;
                lastName?: string;
                email?: string;
                phone?: string;
                company?: string;
                jobTitle?: string;
            };
        };
    };
    createdAt: string | Date;
    updatedAt: string | Date;
}

export function useForms() {
    const { data, error, isLoading, mutate } = useSWR<IFormData[]>('/api/v2/forms', fetcher);

    const createForm = async (templateId?: string) => {
        const res = await fetch('/api/v2/forms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateId }),
        });
        if (!res.ok) throw new Error('Failed to create form');
        const newForm = await res.json();
        mutate();
        return newForm;
    };

    const deleteForm = async (id: string) => {
        const res = await fetch(`/api/v2/forms/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete form');
        mutate(data?.filter(f => f._id !== id), false);
        mutate(); // Revalidate
    };

    const updateForm = async (id: string, updates: Partial<IFormData>) => {
        const res = await fetch(`/api/v2/forms/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error('Failed to update form');
        const updated = await res.json();
        mutate(data?.map(f => f._id === id ? { ...f, ...updates } as IFormData : f), false);
        return updated;
    };

    return {
        forms: data,
        isLoading,
        isError: error,
        createForm,
        deleteForm,
        updateForm,
        mutate,
    };
}

export function useForm(id: string) {
    const { data, error, isLoading, mutate } = useSWR<IFormData>(id ? `/api/v2/forms/${id}` : null, fetcher);

    const updateForm = async (updates: Partial<IFormData>) => {
        const res = await fetch(`/api/v2/forms/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error('Failed to update form');
        const updated = await res.json();
        mutate(updated, false); // Optimistic update could be better but keeping simple
        return updated;
    };

    const deleteForm = async () => {
        const res = await fetch(`/api/v2/forms/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete form');
        return true;
    };

    return {
        form: data,
        isLoading,
        isError: error,
        updateForm,
        deleteForm,
        mutate,
    };
}
