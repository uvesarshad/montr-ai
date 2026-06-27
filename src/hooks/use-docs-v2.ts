import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';

export interface Document {
    _id: string;
    userId: string;
    title: string;
    content: string;
    isPublished?: boolean;
    isPasswordProtected?: boolean;
    password?: string | null;
    publishedUrl?: string; // Legacy
    publishedSlug?: string;
    publishedUsername?: string;
    folderId?: string | null;
    referenceId?: string | null;
    referenceType?: string | null;
    createdAt: string;
    updatedAt: string;
    // ... other fields
}

export interface Folder {
    _id: string;
    userId: string;
    name: string;
    parentId?: string | null;
    isPublished?: boolean;
    publishedSlug?: string;
    publishedUsername?: string; // Added to match model
    createdAt: string;
    updatedAt: string;
}

export interface UseDocsResult {
    documents: Document[] | null;
    folders: Folder[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;

    // Doc Actions
    createDocument: (title: string, content?: string, folderId?: string | null) => Promise<Document>;
    updateDocument: (id: string, updates: Partial<Document>) => Promise<Document>;
    deleteDocument: (id: string) => Promise<void>;

    // Folder Actions
    createFolder: (name: string, parentId?: string | null) => Promise<Folder>;
    updateFolder: (id: string, updates: Partial<Folder>) => Promise<Folder>;
    deleteFolder: (id: string) => Promise<void>;
}

export interface UseDocsOptions {
    folderId?: string | null;
    view?: 'mine' | 'shared';
    sortBy?: 'updatedAt' | 'title';
}

/**
 * Hook to manage documents and folders using MongoDB API (v2)
 */
export function useDocs({ folderId, view = 'mine', sortBy = 'updatedAt' }: UseDocsOptions = {}): UseDocsResult {
    const { data: _session, status } = useSession();

    const [documents, setDocuments] = useState<Document[] | null>(null);
    const [folders, setFolders] = useState<Folder[] | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchContent = useCallback(async () => {
        if (status !== 'authenticated') {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            // Fetch Folders
            // API expects 'parentId=null' for root, or specific ID.
            const parentIdParam = folderId || 'null';
            const foldersRes = await fetch(`/api/v2/folders?parentId=${parentIdParam}&view=${view}`, { credentials: 'include' });
            if (!foldersRes.ok) throw new Error('Failed to fetch folders');
            const foldersData = await foldersRes.json();

            // Fetch Documents
            let docsUrl = `/api/v2/documents?sortBy=${sortBy}&view=${view}`;
            if (folderId) docsUrl += `&folderId=${folderId}`;

            const docsRes = await fetch(docsUrl, { credentials: 'include' });
            if (!docsRes.ok) throw new Error('Failed to fetch documents');
            const docsData = await docsRes.json();

            setFolders(foldersData.folders || []);
            setDocuments(docsData.documents || []);

        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [status, sortBy, view, folderId]);

    useEffect(() => {
        fetchContent();
    }, [fetchContent]);

    // --- Document Actions ---

    const createDocument = useCallback(async (title: string, content?: string, fId?: string | null): Promise<Document> => {
        const response = await fetch('/api/v2/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                title,
                content: content || '',
                folderId: fId ?? folderId // Default to current folder if not specified
            }),
        });

        if (!response.ok) throw new Error('Failed to create document');

        const newDoc = await response.json();
        // Optimistic update
        setDocuments(prev => prev ? [newDoc, ...prev] : [newDoc]);
        return newDoc;
    }, [folderId]);

    const updateDocument = useCallback(async (id: string, updates: Partial<Document>): Promise<Document> => {
        const response = await fetch(`/api/v2/documents/${id}`, { // Note: Update logic is same, uses /documents/[id] which needs to exist (not created yet in plan? Ops, plan didn't specify updating single doc route but it likely exists as GET/PATCH/DELETE)
            // Wait, does /api/v2/documents/[id] exist? Repos usually have it. 
            // Existing use-docs-v2 had it. Assume it exists or I need to create/verify it.
            // Existing code showed updateDocument calling `/api/v2/documents/${id}`. So it exists.
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates),
        });

        if (!response.ok) throw new Error('Failed to update document');

        const updatedDoc = await response.json();
        setDocuments(prev => prev ? prev.map(d => d._id === id ? updatedDoc : d) : null);
        return updatedDoc;
    }, []);

    const deleteDocument = useCallback(async (id: string): Promise<void> => {
        const response = await fetch(`/api/v2/documents/${id}`, { // Assume exists
            method: 'DELETE',
            credentials: 'include',
        });

        if (!response.ok) throw new Error('Failed to delete document');

        setDocuments(prev => prev ? prev.filter(d => d._id !== id) : null);
    }, []);

    // --- Folder Actions ---

    const createFolder = useCallback(async (name: string, pId?: string | null): Promise<Folder> => {
        const response = await fetch('/api/v2/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                name,
                parentId: pId ?? folderId
            }),
        });

        if (!response.ok) throw new Error('Failed to create folder');
        const newFolder = await response.json();
        setFolders(prev => prev ? [...prev, newFolder].sort((a, b) => a.name.localeCompare(b.name)) : [newFolder]);
        return newFolder;
    }, [folderId]);

    const updateFolder = useCallback(async (id: string, updates: Partial<Folder>): Promise<Folder> => {
        const response = await fetch(`/api/v2/folders/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates),
        });

        if (!response.ok) throw new Error('Failed to update folder');

        const updatedFolder = await response.json();
        setFolders(prev => prev ? prev.map(f => f._id === id ? updatedFolder : f) : null);
        return updatedFolder;
    }, []);

    const deleteFolder = useCallback(async (id: string): Promise<void> => {
        const response = await fetch(`/api/v2/folders/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        if (!response.ok) throw new Error('Failed to delete folder');
        setFolders(prev => prev ? prev.filter(f => f._id !== id) : null);
    }, []);

    return {
        documents,
        folders,
        isLoading,
        error,
        refetch: fetchContent,
        createDocument,
        updateDocument,
        deleteDocument,
        createFolder,
        updateFolder,
        deleteFolder,
    };
}

/**
 * Hook to fetch a single document (Unchanged mostly)
 */
export function useDocument(id: string | null) {
    const { status } = useSession();
    const [document, setDocument] = useState<Document | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchDocument = useCallback(async () => {
        if (status !== 'authenticated' || !id) {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch(`/api/v2/documents/${id}`, {
                credentials: 'include',
            });

            if (!response.ok) {
                if (response.status === 404) {
                    setError(new Error('Document not found'));
                } else {
                    throw new Error('Failed to fetch document');
                }
                return;
            }

            const data = await response.json();
            setDocument(data);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [id, status]);

    useEffect(() => {
        fetchDocument();
    }, [fetchDocument]);

    const updateDocument = useCallback(async (updates: Partial<Document>): Promise<Document | null> => {
        if (!id) return null;

        const response = await fetch(`/api/v2/documents/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates),
        });

        if (!response.ok) throw new Error('Failed to update document');

        const updatedDoc = await response.json();
        setDocument(updatedDoc);
        return updatedDoc;
    }, [id]);

    return {
        document,
        isLoading,
        error,
        refetch: fetchDocument,
        updateDocument,
    };
}

/**
 * Hook to fetch a single folder with ancestors
 */
export function useFolder(id: string | null) {
    const { status } = useSession();
    const [folder, setFolder] = useState<Folder & { ancestors?: Folder[] } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchFolder = useCallback(async () => {
        if (status !== 'authenticated' || !id) {
            setFolder(null); // Reset if no ID (root)
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch(`/api/v2/folders/${id}`, {
                credentials: 'include',
            });

            if (!response.ok) {
                if (response.status === 404) {
                    setError(new Error('Folder not found'));
                } else {
                    throw new Error('Failed to fetch folder');
                }
                return;
            }

            const data = await response.json();
            setFolder(data);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [id, status]);

    useEffect(() => {
        fetchFolder();
    }, [fetchFolder]);

    return {
        folder,
        isLoading,
        error,
        refetch: fetchFolder,
    };
}
