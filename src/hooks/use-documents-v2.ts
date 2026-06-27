import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';

interface Document {
    _id: string;
    userId: string;
    title: string;
    content: string;
    isPublished: boolean;
    publishedUrl?: string;
    publishedUsername?: string;
    coverImage?: string;
    createdAt: string;
    updatedAt: string;
}

interface UseDocumentsResult {
    documents: Document[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    createDocument: (title: string, content?: string) => Promise<Document>;
    updateDocument: (id: string, updates: Partial<Document>) => Promise<Document>;
    deleteDocument: (id: string) => Promise<void>;
}

/**
 * Hook to manage documents using MongoDB API (v2)
 */
export function useDocuments(sortBy: 'updatedAt' | 'title' = 'updatedAt'): UseDocumentsResult {
    const { data: _session, status } = useSession();
    const [documents, setDocuments] = useState<Document[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchDocuments = useCallback(async () => {
        if (status !== 'authenticated') {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch(`/api/v2/documents?sortBy=${sortBy}`, {
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('Failed to fetch documents');
            }

            const data = await response.json();
            setDocuments(data.documents);
        } catch (err) {
            setError(err as Error);
            console.error('Error fetching documents:', err);
        } finally {
            setIsLoading(false);
        }
    }, [status, sortBy]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const createDocument = useCallback(async (title: string, content?: string): Promise<Document> => {
        const response = await fetch('/api/v2/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ title, content }),
        });

        if (!response.ok) {
            throw new Error('Failed to create document');
        }

        const document = await response.json();
        setDocuments((prev) => (prev ? [document, ...prev] : [document]));
        return document;
    }, []);

    const updateDocument = useCallback(async (id: string, updates: Partial<Document>): Promise<Document> => {
        const response = await fetch(`/api/v2/documents/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            throw new Error('Failed to update document');
        }

        const updatedDocument = await response.json();
        setDocuments((prev) =>
            prev ? prev.map((d) => (d._id === id ? updatedDocument : d)) : [updatedDocument]
        );
        return updatedDocument;
    }, []);

    const deleteDocument = useCallback(async (id: string): Promise<void> => {
        const response = await fetch(`/api/v2/documents/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error('Failed to delete document');
        }

        setDocuments((prev) => (prev ? prev.filter((d) => d._id !== id) : null));
    }, []);

    return {
        documents,
        isLoading,
        error,
        refetch: fetchDocuments,
        createDocument,
        updateDocument,
        deleteDocument,
    };
}

/**
 * Hook to get a single document by ID
 */
export function useDocument(documentId: string | null) {
    const { status } = useSession();
    const [document, setDocument] = useState<Document | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!documentId || status !== 'authenticated') {
            setIsLoading(false);
            return;
        }

        const fetchDocument = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const response = await fetch(`/api/v2/documents/${documentId}`, {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch document');
                }

                const data = await response.json();
                setDocument(data);
            } catch (err) {
                setError(err as Error);
                console.error('Error fetching document:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDocument();
    }, [documentId, status]);

    return { document, isLoading, error };
}
