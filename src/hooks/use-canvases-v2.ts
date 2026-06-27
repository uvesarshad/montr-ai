import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';
import { useCurrentBrand } from '@/hooks/use-current-brand';

export interface Canvas {
    _id: string;
    userId: string;
    name: string;
    data: string;
    /** Agency mode (B2-5.4) — brand the canvas belongs to. Null = org-wide. */
    brandId?: string | null;
    previewKey?: string;
    previewUrl?: string;
    createdAt: string;
    updatedAt: string;
    stats?: {
        executionCount: number;
        isActive: boolean;
        lastExecutedAt?: string;
    };
}

interface UseCanvasesResult {
    canvases: Canvas[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    createCanvas: (name: string, data?: string) => Promise<Canvas>;
    updateCanvas: (id: string, updates: Partial<Canvas>) => Promise<Canvas>;
    deleteCanvas: (id: string) => Promise<void>;
}

/**
 * Hook to manage canvases using MongoDB API (v2)
 * This will eventually replace the Firebase-based useCollection hook
 */
export function useCanvases(sortBy: 'updatedAt' | 'name' = 'updatedAt'): UseCanvasesResult {
    const { data: _session, status } = useSession();
    const { currentBrandId } = useCurrentBrand();
    const [canvases, setCanvases] = useState<Canvas[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchCanvases = useCallback(async () => {
        if (status !== 'authenticated') {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const brandQuery = currentBrandId ? `&brandId=${encodeURIComponent(currentBrandId)}` : '';
            const response = await fetch(`/api/v2/canvases?sortBy=${sortBy}${brandQuery}`, {
                credentials: 'include',
            });


            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.details || errorData.error || 'Failed to fetch canvases');
            }

            const data = await response.json();
            setCanvases(data.canvases);
        } catch (err) {
            setError(err as Error);
            console.error('Error fetching canvases:', err);
        } finally {
            setIsLoading(false);
        }
    }, [status, sortBy, currentBrandId]);

    useEffect(() => {
        fetchCanvases();
    }, [fetchCanvases]);

    const createCanvas = useCallback(async (name: string, data?: string): Promise<Canvas> => {
        const response = await fetch('/api/v2/canvases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            // Stamp the new canvas with the currently-selected brand so it
            // shows up in the brand-scoped list immediately after creation.
            body: JSON.stringify({ name, data, brandId: currentBrandId }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || errorData.error || 'Failed to create canvas');
        }

        const canvas = await response.json();
        setCanvases((prev) => (prev ? [canvas, ...prev] : [canvas]));
        return canvas;
    }, [currentBrandId]);

    const updateCanvas = useCallback(async (id: string, updates: Partial<Canvas>): Promise<Canvas> => {
        const response = await fetch(`/api/v2/canvases/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || errorData.error || 'Failed to update canvas');
        }

        const updatedCanvas = await response.json();
        setCanvases((prev) =>
            prev ? prev.map((c) => (c._id === id ? updatedCanvas : c)) : [updatedCanvas]
        );
        return updatedCanvas;
    }, []);

    const deleteCanvas = useCallback(async (id: string): Promise<void> => {
        const response = await fetch(`/api/v2/canvases/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || errorData.error || 'Failed to delete canvas');
        }

        setCanvases((prev) => (prev ? prev.filter((c) => c._id !== id) : null));
    }, []);

    return {
        canvases,
        isLoading,
        error,
        refetch: fetchCanvases,
        createCanvas,
        updateCanvas,
        deleteCanvas,
    };
}

/**
 * Hook to get a single canvas by ID
 */
export function useCanvas(canvasId: string | null) {
    const { status } = useSession();
    const [canvas, setCanvas] = useState<Canvas | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!canvasId || status !== 'authenticated') {
            setIsLoading(false);
            return;
        }

        const fetchCanvas = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const response = await fetch(`/api/v2/canvases/${canvasId}`, {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch canvas');
                }

                const data = await response.json();
                setCanvas(data);
            } catch (err) {
                setError(err as Error);
                console.error('Error fetching canvas:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCanvas();
    }, [canvasId, status]);

    return { canvas, isLoading, error };
}
