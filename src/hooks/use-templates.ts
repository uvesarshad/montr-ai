import useSWR from 'swr';
import { useCurrentBrand } from '@/hooks/use-current-brand';

// Define types based on our Mongoose models
export interface IFormTemplate {
    _id: string;
    title: string;
    description: string;
    icon: 'Mail' | 'BarChart2' | 'FileText';
    content: string;
    settings: {
        theme?: string;
        emailNotifications?: boolean;
        submitButtonText?: string;
        thankYouMessage?: string;
        thankYouUrl?: string;
    };
    isActive: boolean;
    sortOrder: number;
}

export interface IDocTemplate {
    _id: string;
    title: string;
    description: string;
    icon: 'FileText' | 'PenSquare' | 'Compass' | 'Mail';
    content: string;
    settings: {
        coverImage?: string;
    };
    isActive: boolean;
    sortOrder: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useFormTemplates() {
    const { data, error, isLoading } = useSWR<{ templates: IFormTemplate[] }>('/api/templates/forms', fetcher);

    return {
        templates: data?.templates || [],
        isLoading,
        isError: error,
    };
}

export function useDocTemplates() {
    const { data, error, isLoading } = useSWR<{ templates: IDocTemplate[] }>('/api/templates/docs', fetcher);

    return {
        templates: data?.templates || [],
        isLoading,
        isError: error,
    };
}


export interface IWorkflowTemplate {
    _id: string;
    name: string;
    description: string;
    category: string;
    difficulty: string;
    thumbnailUrl?: string;
    workflowType: string;
    authorName?: string;
    authorType?: 'system' | 'verified' | 'community';
    isOfficial?: boolean;
    isFeatured?: boolean;
    isVerified?: boolean;
    isPublished: boolean;
    tags?: string[];
    nodes: unknown[];
    edges: unknown[];
    variables: unknown[];
    installCount?: number;
    viewCount?: number;
    favoriteCount?: number;
    averageRating?: number;
    reviewCount?: number;
    setupTime?: number;
    createdAt?: string;
    updatedAt?: string;
    lastUpdatedAt?: string;
}

export function useWorkflowTemplates() {
    // Agency mode (B2-5.4): surface brand-private + public templates when a
    // brand is picked; null/all → public-only behaviour is identical (brand
    // filter omitted).
    const { currentBrandId } = useCurrentBrand();
    const url = currentBrandId
        ? `/api/v2/workflow-templates?brandId=${encodeURIComponent(currentBrandId)}`
        : '/api/v2/workflow-templates';
    const { data, error, isLoading } = useSWR<{ templates: IWorkflowTemplate[] }>(url, fetcher);

    return {
        templates: data?.templates || [],
        isLoading,
        isError: error,
    };
}
