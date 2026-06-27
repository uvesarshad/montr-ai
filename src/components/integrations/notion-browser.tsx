'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NotionLogo } from "@/components/social-icons";
import { Search, Loader2, FileText, Database, Calendar, ExternalLink, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface NotionBrowserProps {
    brandId?: string; // Optional: will fetch brands if not provided
    onSelectPage: (pageId: string, title: string, brandId: string) => void;
    children?: React.ReactNode;
}

interface Brand {
    _id: string;
    name: string;
}

interface NotionPage {
    id: string;
    title: string;
    url: string;
    lastEditedAt: string;
}

interface NotionDatabase {
    id: string;
    title: string;
    url: string;
}

export function NotionBrowser({ brandId: initialBrandId, onSelectPage, children }: NotionBrowserProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [activeBrandId, setActiveBrandId] = useState<string>(initialBrandId || '');
    const [results, setResults] = useState<{ pages: NotionPage[]; databases: NotionDatabase[] }>({
        pages: [],
        databases: [],
    });

    const { toast } = useToast();

    const fetchResults = useCallback(async (searchQuery: string = '') => {
        if (!activeBrandId) return;

        setIsLoading(true);
        try {
            const response = await fetch(`/api/social/notion/search?brandId=${activeBrandId}&query=${encodeURIComponent(searchQuery)}`);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to fetch Notion content');
            }
            const data = await response.json();
            setResults(data);
        } catch (error: unknown) {
            console.error('Notion search error:', error);
            toast({
                variant: 'destructive',
                title: 'Notion Error',
                description: error instanceof Error ? error.message : 'An error occurred',
            });
        } finally {
            setIsLoading(false);
        }
    }, [activeBrandId, toast]);

    // Fetch brands if not provided
    useEffect(() => {
        if (open && !initialBrandId && brands.length === 0) {
            const fetchBrands = async () => {
                try {
                    const res = await fetch('/api/social/brands');
                    if (res.ok) {
                        const data = await res.json();
                        setBrands(data.brands || []);
                        if (data.brands?.length > 0 && !activeBrandId) {
                            setActiveBrandId(data.brands[0]._id);
                        }
                    }
                } catch (err) {
                    console.error('Failed to fetch brands:', err);
                }
            };
            fetchBrands();
        }
    }, [open, initialBrandId, brands.length, activeBrandId]);

    // Update activeBrandId if initialBrandId changes
    useEffect(() => {
        if (initialBrandId) {
            setActiveBrandId(initialBrandId);
        }
    }, [initialBrandId]);

    // Initial results fetch
    useEffect(() => {
        if (open && activeBrandId && results.pages.length === 0 && results.databases.length === 0) {
            fetchResults();
        }
    }, [open, activeBrandId, fetchResults, results.pages.length, results.databases.length]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchResults(query);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || (
                    <Button variant="outline" size="sm" className="gap-2">
                        <NotionLogo className="size-4" />
                        Import from Notion
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] h-[600px] flex flex-col p-0">
                <DialogHeader className="p-6 pb-0">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <DialogTitle className="flex items-center gap-2">
                                <NotionLogo className="size-5" />
                                Browse Notion Content
                            </DialogTitle>
                            <DialogDescription>
                                Search for pages or databases in your connected Notion workspace.
                            </DialogDescription>
                        </div>
                        {brands.length > 0 && (
                            <div className="flex flex-col gap-1.5 min-w-[140px]">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Brand</span>
                                <Select value={activeBrandId} onValueChange={setActiveBrandId}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Select Brand" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {brands.map(brand => (
                                            <SelectItem key={brand._id} value={brand._id} className="text-xs">
                                                {brand.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </DialogHeader>

                <div className="px-6 py-4">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                            <Input
                                placeholder="Search pages..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Loader2 className="size-4 animate-spin" /> : 'Search'}
                        </Button>
                    </form>
                </div>

                <div className="flex-1 overflow-hidden px-6 pb-6">
                    <ScrollArea className="h-full pr-4">
                        {isLoading && results.pages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <Loader2 className="size-8 animate-spin mb-4" />
                                <p>Searching your Notion workspace...</p>
                            </div>
                        )}

                        {!isLoading && results.pages.length === 0 && results.databases.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground">
                                <p>No results found. Try a different search term or ensure your Notion integration has access to the content.</p>
                            </div>
                        )}

                        {results.databases.length > 0 && (
                            <div className="mb-6">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                                    <Database className="size-3" />
                                    Databases
                                </h4>
                                <div className="grid gap-2">
                                    {results.databases.map((db) => (
                                        <div
                                            key={db.id}
                                            className="group flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-accent hover:border-accent transition-all cursor-pointer"
                                            onClick={() => {/* TODO: browse DB items */ }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded bg-muted group-hover:bg-background">
                                                    <Database className="size-4" />
                                                </div>
                                                <span className="font-medium text-sm">{db.title}</span>
                                            </div>
                                            <Button variant="ghost" size="icon" className="size-8">
                                                <ArrowRight className="size-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {results.pages.length > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                                    <FileText className="size-3" />
                                    Pages
                                </h4>
                                <div className="grid gap-2">
                                    {results.pages.map((page) => (
                                        <div
                                            key={page.id}
                                            className="group flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-accent hover:border-accent transition-all cursor-pointer"
                                            onClick={() => {
                                                onSelectPage(page.id, page.title, activeBrandId);
                                                setOpen(false);
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded bg-muted group-hover:bg-background">
                                                    <FileText className="size-4" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm">{page.title}</p>
                                                    <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                        <Calendar className="size-3" />
                                                        Edited {format(new Date(page.lastEditedAt), 'MMM d, yyyy')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.open(page.url, '_blank');
                                                    }}
                                                >
                                                    <ExternalLink className="size-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                                                    Select
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
}
