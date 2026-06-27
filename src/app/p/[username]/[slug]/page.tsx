'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Calendar, Clock, Eye, Lock, Menu, ChevronRight, Folder as FolderIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
    Sheet,
    SheetContent,
    SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FormEmbedNode } from '@/components/docs/form-embed';
import { SlashCommand } from '@/components/docs/slash-command';
import { PasswordGate } from '@/components/docs/password-gate';

interface SidebarItem {
    _id: string;
    name?: string;
    title?: string;
    publishedSlug: string;
}

interface SidebarData {
    folders?: SidebarItem[];
    documents?: SidebarItem[];
}

interface FolderData {
    _id: string;
    name: string;
}

interface DocumentData {
    _id: string;
    title: string;
    content: string;
    createdAt?: string;
}

interface PublicDocResponse {
    type: 'folder' | 'document';
    isPasswordProtected?: boolean;
    data: FolderData | DocumentData;
    sidebar?: SidebarData;
    folder?: FolderData;
}

function calculateReadingTime(text: string): number {
    if (!text) return 0;
    const plainText = text.replace(/<[^>]+>/g, '');
    const wordsPerMinute = 200;
    const words = plainText.trim().split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute);
}

export default function PublicDocPage() {
    const params = useParams();
    const username = params.username as string;
    const slugWithId = params.slug as string;

    const docId = slugWithId.slice(-24);

    const [data, setData] = useState<PublicDocResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [password, setPassword] = useState<string>('');
    const [passwordError, setPasswordError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!docId || !username) return;

            setIsLoading(true);
            setError(null);
            setPasswordError(null);

            try {
                const headers: HeadersInit = {};
                if (password) {
                    headers['x-doc-password'] = password;
                }

                const res = await fetch(`/api/v2/public/documents?docId=${docId}&username=${username}`, {
                    headers
                });

                if (res.ok) {
                    const json = await res.json();

                    // Check if password protected and no content (access denied or needs password)
                    if (json.isPasswordProtected && !json.data.content) {
                        if (password) {
                            setPasswordError('Invalid password');
                        }
                        // Keep data to show title if available (from limited response)
                        // But we want to show gate.
                        setData(json);
                    } else {
                        setData(json);
                    }
                } else {
                    setError('Content not found or not published');
                }
            } catch (err: unknown) {
                console.error('Error fetching public content:', err);
                setError('Failed to load content');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [docId, username, password]); // Refetch when password changes

    if (isLoading) {
        return <LoadingSkeleton />;
    }

    if (error || !data) {
        return <ErrorState error={error} />;
    }

    if (data.isPasswordProtected && !(data.data as DocumentData).content) {
        return (
            <PasswordGate
                onUnlock={async (pw) => setPassword(pw)}
                isLoading={isLoading}
                error={passwordError}
            />
        );
    }

    const { type, data: contentData, sidebar, folder } = data;
    const showSidebar = !!sidebar && ((sidebar.folders?.length ?? 0) > 0 || (sidebar.documents?.length ?? 0) > 0);

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="border-b sticky top-0 bg-background/80 backdrop-blur-xl z-20 h-14 flex items-center">
                <div className="container px-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {showSidebar && (
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon" className="md:hidden">
                                        <Menu className="size-5" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-[80vw] sm:w-[300px] p-0">
                                    <SidebarContent
                                        sidebar={sidebar}
                                        username={username}
                                        currentId={contentData._id}
                                        folderName={folder?.name || 'Contents'}
                                    />
                                </SheetContent>
                            </Sheet>
                        )}
                        <Link href="/" className="flex items-center gap-2 font-semibold">
                            <div className="bg-primary/10 p-1.5 rounded-md text-primary">
                                <FileText className="size-4" />
                            </div>
                            <span className="hidden sm:inline">MontrAI Docs</span>
                        </Link>
                        {folder && (
                            <>
                                <ChevronRight className="size-4 text-muted-foreground" />
                                <span className="text-sm font-medium truncate max-w-[150px]">{folder.name}</span>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-3 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/30 px-2 py-1 rounded-full">
                            <Eye className="size-3" />
                            <span className="text-xs">@{username}</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex-1 flex container max-w-7xl mx-auto px-4 gap-8">
                {showSidebar && (
                    <aside className="hidden md:block w-64 lg:w-72 border-r py-8 h-[calc(100vh-3.5rem)] sticky top-14 overflow-hidden">
                        <SidebarContent
                            sidebar={sidebar}
                            username={username}
                            currentId={contentData._id}
                            folderName={folder?.name || 'Contents'}
                        />
                    </aside>
                )}

                <main className={cn("flex-1 py-12", showSidebar ? "max-w-3xl" : "max-w-4xl mx-auto")}>
                    {type === 'folder' ? (
                        <FolderView folder={contentData as FolderData} sidebar={sidebar ?? {}} username={username} />
                    ) : (
                        <DocumentView doc={contentData as DocumentData} />
                    )}
                </main>
            </div>
        </div>
    );
}

function SidebarContent({ sidebar, username, currentId, folderName }: { sidebar: SidebarData; username: string; currentId: string; folderName: string }) {
    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FolderIcon className="size-4 text-muted-foreground" />
                    {folderName}
                </h3>
            </div>
            <ScrollArea className="flex-1 p-4">
                <div className="flex flex-col gap-1">
                    {sidebar.folders?.map((f: SidebarItem) => (
                        <Link
                            key={f._id}
                            href={`/p/${username}/${f.publishedSlug}`}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                                f._id === currentId
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <FolderIcon className="size-4 shrink-0" />
                            <span className="truncate">{f.name}</span>
                        </Link>
                    ))}
                    {sidebar.documents?.map((d: SidebarItem) => (
                        <Link
                            key={d._id}
                            href={`/p/${username}/${d.publishedSlug}`}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                                d._id === currentId
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <FileText className="size-4 shrink-0" />
                            <span className="truncate">{d.title}</span>
                        </Link>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}

function FolderView({ folder, sidebar, username }: { folder: FolderData; sidebar: SidebarData; username: string }) {
    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold">{folder.name}</h1>
                <p className="text-muted-foreground">Folder content index</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {sidebar.folders?.map((f: SidebarItem) => (
                    <Link key={f._id} href={`/p/${username}/${f.publishedSlug}`} className="block group">
                        <div className="border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all bg-card">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg text-indigo-500">
                                    <FolderIcon className="size-5" />
                                </div>
                                <h3 className="font-medium group-hover:text-primary transition-colors">{f.name}</h3>
                            </div>
                        </div>
                    </Link>
                ))}
                {sidebar.documents?.map((d: SidebarItem) => (
                    <Link key={d._id} href={`/p/${username}/${d.publishedSlug}`} className="block group">
                        <div className="border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all bg-card">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-muted rounded-lg text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                    <FileText className="size-5" />
                                </div>
                                <h3 className="font-medium group-hover:text-primary transition-colors">{d.title}</h3>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}

function DocumentView({ doc }: { doc: DocumentData }) {
    const readingTime = calculateReadingTime(doc.content);

    const editor = useEditor({
        editable: false,
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3, 4, 5, 6],
                },
                codeBlock: false,
            }),
            FormEmbedNode,
            SlashCommand, // Not needed for read-only but innocuous
        ],
        content: doc.content, // Tiptap handles both HTML and JSON
        editorProps: {
            attributes: {
                class: 'prose prose-stone dark:prose-invert prose-lg max-w-none focus:outline-none',
            },
        },
    });

    // Update content when doc changes (e.g. navigation)
    useEffect(() => {
        if (editor && doc.content) {
            // Check if content matches to avoid unnecessary updates/resets
            // For simple view this is fine.
            editor.commands.setContent(doc.content);
        }
    }, [doc.content, editor]);

    return (
        <article className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4 border-b pb-8">
                <h1 className="text-4xl md:text-5xl font-bold leading-tight">{doc.title}</h1>
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    {doc.createdAt && (
                        <div className="flex items-center gap-1.5">
                            <Calendar className="size-4" />
                            <span>{format(new Date(doc.createdAt), 'MMM d, yyyy')}</span>
                        </div>
                    )}
                    {readingTime > 0 && (
                        <div className="flex items-center gap-1.5">
                            <Clock className="size-4" />
                            <span>{readingTime} min read</span>
                        </div>
                    )}
                </div>
            </div>

            {editor && <EditorContent editor={editor} />}
        </article>
    );
}

function LoadingSkeleton() {
    return (
        <div className="min-h-screen bg-background">
            <div className="container max-w-4xl mx-auto px-4 py-12 space-y-8">
                <Skeleton className="h-12 w-3/4" />
                <div className="flex gap-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-24" />
                </div>
                <div className="space-y-4 pt-8">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-32 w-full" />
                </div>
            </div>
        </div>
    );
}

function ErrorState({ error }: { error: string | null }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="text-center max-w-md">
                <div className="bg-muted/30 p-4 rounded-full w-fit mx-auto mb-4">
                    <Lock className="size-8 text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
                <p className="text-muted-foreground mb-6">
                    {error || 'This content does not exist or is not publicly accessible.'}
                </p>
                <Link href="/login">
                    <Button>Return to Home</Button>
                </Link>
            </div>
        </div>
    );
}
