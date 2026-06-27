'use client';

import { useState, useEffect, useCallback } from 'react';

// Types (Mirrors of what the API returns)
export interface Canvas {
    _id: string;
    id: string; // compatibility
    userId: string;
    name: string;
    data: string;
    previewUrl?: string;
    updatedAt: string;
    createdAt: string;
}

export interface Document {
    _id: string;
    id: string; // compatibility
    userId: string;
    title: string;
    content: string;
    isPublished: boolean;
    publishedUrl?: string;
    publishedUsername?: string;
    coverImage?: string;
    updatedAt: string;
    createdAt: string;
}

interface UseDataResult<T> {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
    mutate: () => Promise<void>; // Function to re-fetch/refresh data
}

/**
 * Fetch a single canvas by ID
 */
export function useCanvas(id: string | null | undefined): UseDataResult<Canvas> {
    const [data, setData] = useState<Canvas | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchData = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/v2/canvases/${id}`);
            if (!res.ok) throw new Error(`Failed to fetch canvas: ${res.statusText}`);
            const json = await res.json();
            // Add 'id' aliases for compatibility if backend returns _id
            if (json && json._id && !json.id) json.id = json._id;
            setData(json);
            setError(null);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            fetchData();
        } else {
            setData(null);
        }
    }, [id, fetchData]);

    return { data, isLoading, error, mutate: fetchData };
}

/**
 * Fetch a single document by ID
 */
export function useDocument(id: string | null | undefined): UseDataResult<Document> {
    const [data, setData] = useState<Document | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchData = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/v2/documents/${id}`);
            if (!res.ok) throw new Error(`Failed to fetch document: ${res.statusText}`);
            const json = await res.json();
            if (json && json._id && !json.id) json.id = json._id;
            setData(json);
            setError(null);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            fetchData();
        } else {
            setData(null);
        }
    }, [id, fetchData]);

    return { data, isLoading, error, mutate: fetchData };
}

/**
 * Fetch all documents for the user
 */
export function useDocuments(): UseDataResult<Document[]> & { count: number } {
    const [data, setData] = useState<Document[] | null>(null);
    const [count, setCount] = useState(0);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/v2/documents`);
            if (!res.ok) throw new Error(`Failed to fetch documents: ${res.statusText}`);
            const json = await res.json();

            const docs = json.documents || [];
            // Add aliases
            docs.forEach((d: { _id?: string; id?: string }) => { if (d._id && !d.id) d.id = d._id; });

            setData(docs);
            setCount(json.count || 0);
            setError(null);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, count, isLoading, error, mutate: fetchData };
}
