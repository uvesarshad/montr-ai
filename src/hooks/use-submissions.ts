import useSWR from 'swr';
import { fetcher } from '@/lib/utils';

// Plain data shape returned by the API (JSON serialised — _id is always a string)
export interface IFormSubmissionData {
    _id: string;
    formId: string;
    data: Record<string, unknown>;
    metadata: {
        ip?: string;
        userAgent?: string;
        submittedAt: string | Date;
    };
    createdAt: string | Date;
    updatedAt: string | Date;
}

interface SubmissionsResponse {
    data: IFormSubmissionData[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }
}

export function useSubmissions(formId: string, page = 1, limit = 50) {
    const { data, error, isLoading, mutate } = useSWR<SubmissionsResponse>(
        formId ? `/api/v2/forms/${formId}/submissions?page=${page}&limit=${limit}` : null,
        fetcher
    );

    return {
        submissions: data?.data || [],
        meta: data?.meta,
        isLoading,
        isError: error,
        mutate,
    };
}
