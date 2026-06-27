'use client';

/**
 * Doc-editor control for publishing a document to WordPress.
 *
 * Opens a dialog that lists the org's connected WordPress integrations, lets
 * the user pick one (auto-selected when there's exactly one) plus a post
 * status, then POSTs to the publish-wordpress route. Mirrors the
 * NotionSyncControl conventions (ghost sm button, FormDialog, Field/Select).
 */

import { useCallback, useEffect, useReducer, useState } from 'react';
import { PenSquare } from 'lucide-react';
import Link from 'next/link';
import { Button, Spinner, FormDialog, Field, Select } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';

interface WordpressConnection {
    _id: string;
    provider: string;
    externalAccountName?: string | null;
}

const STATUS_OPTIONS = [
    { value: 'draft', label: 'Draft — review before going live' },
    { value: 'publish', label: 'Publish — make it live immediately' },
];

interface WordpressPublishControlProps {
    docId: string;
}

interface ConnectionsState {
    loading: boolean;
    connections: WordpressConnection[];
    connectionId: string;
}

type ConnectionsAction =
    | { type: 'load_start' }
    | { type: 'load_success'; connections: WordpressConnection[] }
    | { type: 'load_error' }
    | { type: 'set_connection'; connectionId: string };

const initialConnectionsState: ConnectionsState = {
    loading: false,
    connections: [],
    connectionId: '',
};

function connectionsReducer(state: ConnectionsState, action: ConnectionsAction): ConnectionsState {
    switch (action.type) {
        case 'load_start':
            return { ...state, loading: true };
        case 'load_success':
            return {
                loading: false,
                connections: action.connections,
                connectionId: action.connections.length === 1 ? action.connections[0]._id : state.connectionId,
            };
        case 'load_error':
            return { ...state, loading: false };
        case 'set_connection':
            return { ...state, connectionId: action.connectionId };
        default:
            return state;
    }
}

export function WordpressPublishControl({ docId }: WordpressPublishControlProps) {
    const { toast } = useToast();

    const [open, setOpen] = useState(false);
    const [{ loading, connections, connectionId }, dispatch] = useReducer(
        connectionsReducer,
        initialConnectionsState
    );
    const [status, setStatus] = useState<'draft' | 'publish'>('draft');

    const loadConnections = useCallback(async () => {
        dispatch({ type: 'load_start' });
        try {
            const response = await fetch('/api/v2/integrations');
            if (!response.ok) throw new Error('Failed to load connections');
            const data = await response.json();
            const wp: WordpressConnection[] = (data.connections || []).filter(
                (c: WordpressConnection) => c.provider === 'wordpress'
            );
            dispatch({ type: 'load_success', connections: wp });
        } catch (error) {
            console.error('Failed to load WordPress connections:', error);
            dispatch({ type: 'load_error' });
            toast({
                variant: 'destructive',
                title: 'Could not load connections',
                description: 'Something went wrong loading your WordPress connections.',
            });
        }
    }, [toast]);

    useEffect(() => {
        if (open) {
            void loadConnections();
        }
    }, [open, loadConnections]);

    const handlePublish = async () => {
        const response = await fetch(`/api/v2/documents/${docId}/publish-wordpress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                connectionId: connectionId || undefined,
                status,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            toast({
                variant: 'destructive',
                title: 'Publish failed',
                description: data.error || 'Could not publish to WordPress.',
            });
            throw new Error('publish_failed');
        }

        const link = data.post?.link as string | undefined;
        toast({
            title: status === 'publish' ? 'Published to WordPress' : 'Draft created in WordPress',
            description: link ? `View post: ${link}` : 'The post was created successfully.',
        });
    };

    const connectionOptions = connections.map((c) => ({
        value: c._id,
        label: c.externalAccountName || c._id,
    }));

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(true)}
                className="gap-2 text-muted-foreground hover:text-foreground"
            >
                <PenSquare className="size-4" />
                <span className="hidden sm:inline">Publish to WordPress</span>
            </Button>

            <FormDialog
                open={open}
                onOpenChange={setOpen}
                title="Publish to WordPress"
                description="Create a post on your connected WordPress site from this document."
                submitLabel="Publish"
                submitDisabled={loading || connections.length === 0}
                onSubmit={handlePublish}
            >
                {loading ? (
                    <div className="flex items-center gap-2 py-4 text-[13px] text-muted-foreground">
                        <Spinner size={14} />
                        Loading connections…
                    </div>
                ) : connections.length === 0 ? (
                    <p className="py-2 text-[13px] text-muted-foreground">
                        No WordPress site is connected yet. Connect one in{' '}
                        <Link
                            href="/settings?tab=connections"
                            className="font-medium text-brand hover:underline"
                        >
                            Settings → Connections
                        </Link>{' '}
                        to publish this document.
                    </p>
                ) : (
                    <>
                        {connections.length > 1 ? (
                            <Field label="WordPress site">
                                <Select
                                    value={connectionId}
                                    onChange={(v) => dispatch({ type: 'set_connection', connectionId: v })}
                                    options={connectionOptions}
                                    placeholder="Select a connection"
                                />
                            </Field>
                        ) : null}
                        <Field
                            label="Status"
                            hint={
                                status === 'publish'
                                    ? 'The post goes live on your site immediately.'
                                    : 'The post is created as a draft you can review in WordPress.'
                            }
                        >
                            <Select
                                value={status}
                                onChange={(v) => setStatus(v as 'draft' | 'publish')}
                                options={STATUS_OPTIONS}
                            />
                        </Field>
                    </>
                )}
            </FormDialog>
        </>
    );
}
