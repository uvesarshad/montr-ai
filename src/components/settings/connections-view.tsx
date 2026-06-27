'use client';

import { useState, useEffect, useRef } from "react";
import {
    LayoutGrid,
    List,
    Share2,
    Mail,
    MessageSquare,
    Megaphone,
    Plug,
    Loader2,
    PlusCircle,
    Building2,
    ChevronsUpDown,
    Check
} from "lucide-react";
import { Button, Chip, Field, Input, SearchInput, Segmented, FormDialog } from "@/components/ui-kit";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

// Dynamically import sub-components to reduce initial chunk size and prevent load errors
const SocialConnections = dynamic(() => import("./connections/social-connections").then(mod => mod.SocialConnections), {
    loading: () => <div className="flex items-center justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
});

const EmailMarketingConnections = dynamic(() => import("./connections/email-marketing-connections").then(mod => mod.EmailMarketingConnections), {
    loading: () => <div className="flex items-center justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
});

const WhatsAppConnections = dynamic(() => import("./connections/whatsapp-connections").then(mod => mod.WhatsAppConnections), {
    loading: () => <div className="flex items-center justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
});

const IntegrationsList = dynamic(() => import("./connections/integrations-list").then(mod => mod.IntegrationsList), {
    loading: () => <div className="flex items-center justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
});

const IntegrationHub = dynamic(() => import("./connections/integration-hub").then(mod => mod.IntegrationHub), {
    loading: () => <div className="flex items-center justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
});

const AdsAnalyticsConnections = dynamic(() => import("./connections/ads-analytics-connections").then(mod => mod.AdsAnalyticsConnections), {
    loading: () => <div className="flex items-center justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
});

type ViewMode = 'grid' | 'list';
type Category = 'all' | 'social' | 'ads-analytics' | 'marketing-email' | 'whatsapp' | 'integrations' | 'storage';

interface Brand {
    _id: string;
    name: string;
    handle: string;
}

const CATEGORIES: { value: Category; label: string; icon?: typeof Share2 }[] = [
    { value: 'all', label: 'All' },
    { value: 'social', label: 'Social', icon: Share2 },
    { value: 'ads-analytics', label: 'Ads & Analytics', icon: Megaphone },
    { value: 'marketing-email', label: 'Email', icon: Mail },
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
    { value: 'integrations', label: 'Apps', icon: Plug },
];

export function ConnectionsView() {
    const { toast } = useToast();
    const { push } = useRouter();
    const searchParams = useSearchParams();
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [category, setCategory] = useState<Category>('all');
    const [searchQuery, setSearchQuery] = useState("");
    const hasHandledCreateBrandIntent = useRef(false);

    // Brand management
    const [brands, setBrands] = useState<Brand[]>([]);
    const [selectedBrandId, setSelectedBrandId] = useState<string>('');
    const [isLoadingBrands, setIsLoadingBrands] = useState(true);
    const [openBrandSelect, setOpenBrandSelect] = useState(false);

    // Create brand dialog
    const [showCreateBrand, setShowCreateBrand] = useState(false);
    const [newBrandName, setNewBrandName] = useState('');
    const [newBrandHandle, setNewBrandHandle] = useState('');
    const [isCreatingBrand, setIsCreatingBrand] = useState(false);
    const shouldOpenCreateBrand = searchParams.get('createBrand') === '1';
    const returnTo = searchParams.get('returnTo')?.trim() || '';
    const redirectedFromAgent = searchParams.get('from') === 'agent';

    // Fetch brands on mount
    useEffect(() => {
        async function fetchBrands() {
            try {
                const response = await fetch('/api/social/brands');
                if (response.ok) {
                    const data = await response.json();
                    setBrands(data.brands);
                    if (data.brands.length > 0) {
                        setSelectedBrandId(data.brands[0]._id);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch brands:', error);
                toast({ variant: 'destructive', title: 'Failed to load brands' });
            } finally {
                setIsLoadingBrands(false);
            }
        }
        fetchBrands();
    }, [toast]);

    useEffect(() => {
        if (!shouldOpenCreateBrand || hasHandledCreateBrandIntent.current) {
            return;
        }

        hasHandledCreateBrandIntent.current = true;
        setShowCreateBrand(true);

        if (redirectedFromAgent) {
            toast({
                title: 'Create a brand to use Agent',
                description: 'Agent needs a brand context before it can open a workspace',
            });
        }
    }, [redirectedFromAgent, shouldOpenCreateBrand, toast]);

    const handleCreateBrand = async () => {
        if (!newBrandName.trim() || !newBrandHandle.trim()) {
            toast({ variant: 'destructive', title: 'Please fill in all fields' });
            throw new Error('missing fields');
        }

        setIsCreatingBrand(true);
        try {
            const response = await fetch('/api/social/brands', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newBrandName,
                    handle: newBrandHandle,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setBrands([...brands, data.brand]);
                setSelectedBrandId(data.brand._id);
                setShowCreateBrand(false);
                setNewBrandName('');
                setNewBrandHandle('');
                localStorage.setItem('agent-brand-id', data.brand._id);
                localStorage.setItem('copilot-brand-id', data.brand._id);

                if (returnTo) {
                    push(returnTo);
                    return;
                }

                toast({ title: 'Brand created successfully!' });
            } else {
                const error = await response.json();
                toast({ variant: 'destructive', title: error.error || 'Failed to create brand' });
                throw new Error(error.error || 'Failed to create brand');
            }
        } catch (error) {
            console.error('Failed to create brand:', error);
            throw error;
        } finally {
            setIsCreatingBrand(false);
        }
    };

    const selectedBrand = brands.find((brand) => brand._id === selectedBrandId);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-[15px] font-semibold tracking-tight">Connections &amp; Integrations</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage your connected accounts and third-party integrations across all platforms.
                    </p>
                </div>

                {/* Brand Selector */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center rounded-lg border border-border bg-muted/30 p-3 z-50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="size-4" />
                        <span className="font-medium">Brand:</span>
                    </div>
                    <Popover open={openBrandSelect} onOpenChange={setOpenBrandSelect}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openBrandSelect}
                                aria-controls="brand-select-list"
                                iconRight={ChevronsUpDown}
                                className="w-[200px] sm:w-[240px] justify-between"
                                disabled={isLoadingBrands}
                            >
                                {isLoadingBrands ? (
                                    "Loading..."
                                ) : selectedBrand ? (
                                    <span className="flex items-center gap-1.5 truncate">
                                        <span className="font-semibold truncate">{selectedBrand.name}</span>
                                        <span className="text-muted-foreground font-normal truncate">(@{selectedBrand.handle})</span>
                                    </span>
                                ) : (
                                    "Select a brand..."
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] sm:w-[240px] p-0 shadow-lg z-50">
                            <Command>
                                <CommandInput placeholder="Search brands..." />
                                <CommandList className="max-h-[300px] overflow-y-auto">
                                    <CommandEmpty>No brand found.</CommandEmpty>
                                    <CommandGroup>
                                        {brands.map((brand) => (
                                            <CommandItem
                                                key={brand._id}
                                                value={brand.name + brand.handle}
                                                onSelect={() => {
                                                    setSelectedBrandId(brand._id);
                                                    setOpenBrandSelect(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 size-4",
                                                        selectedBrandId === brand._id ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <span className="font-semibold">{brand.name}</span>
                                                <span className="text-muted-foreground font-normal ml-1">(@{brand.handle})</span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                    <Separator />
                                    <CommandGroup>
                                        <CommandItem
                                            onSelect={() => {
                                                setOpenBrandSelect(false);
                                                setShowCreateBrand(true);
                                            }}
                                            className="cursor-pointer text-brand-strong py-2"
                                        >
                                            <PlusCircle className="mr-2 size-4" />
                                            Add New Brand
                                        </CommandItem>
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <Separator />

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center rounded-lg border border-border bg-muted/30 p-4">
                <SearchInput
                    placeholder="Search integrations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    wrapClassName="w-full sm:max-w-xs"
                />

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <div className="flex flex-wrap gap-1.5">
                        {CATEGORIES.map((c) => (
                            <Chip
                                key={c.value}
                                icon={c.icon}
                                tone={category === c.value ? 'brand' : 'gray'}
                                selected={category === c.value}
                                onClick={() => setCategory(c.value)}
                            >
                                {c.label}
                            </Chip>
                        ))}
                    </div>

                    <Segmented
                        value={viewMode}
                        onChange={(v) => setViewMode(v as ViewMode)}
                        options={[
                            { value: 'grid', label: <LayoutGrid className="size-4" /> },
                            { value: 'list', label: <List className="size-4" /> },
                        ]}
                    />
                </div>
            </div>

            {/* Filtered Content Sections */}
            <div className={cn(
                "animate-in fade-in duration-500",
                viewMode === 'grid'
                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    : "flex flex-col gap-3"
            )}>
                {(category === 'all' || category === 'social') && (
                    <section id="social-section" className="transition-all contents">
                        <SocialConnections
                            viewMode={viewMode}
                            searchQuery={searchQuery}
                            hideTitle={category !== 'social'}
                            selectedBrandId={selectedBrandId}
                            brands={brands}
                            onBrandCreated={(brand) => {
                                setBrands([...brands, brand]);
                                setSelectedBrandId(brand._id);
                            }}
                        />
                    </section>
                )}

                {(category === 'all' || category === 'ads-analytics') && (
                    <section id="ads-analytics-section" className="transition-all contents">
                        <AdsAnalyticsConnections
                            viewMode={viewMode}
                            searchQuery={searchQuery}
                            hideTitle={category !== 'ads-analytics'}
                            selectedBrandId={selectedBrandId}
                            brands={brands}
                        />
                    </section>
                )}

                {(category === 'all' || category === 'whatsapp') && (
                    <section id="whatsapp-section" className="transition-all contents">
                        <WhatsAppConnections
                            viewMode={viewMode}
                            searchQuery={searchQuery}
                            hideTitle={category !== 'whatsapp'}
                            selectedBrandId={selectedBrandId}
                            brands={brands}
                        />
                    </section>
                )}

                {(category === 'all' || category === 'marketing-email') && (
                    <section id="email-section" className="transition-all contents">
                        <EmailMarketingConnections
                            viewMode={viewMode}
                            searchQuery={searchQuery}
                            hideTitle={category !== 'marketing-email'}
                            selectedBrandId={selectedBrandId}
                            brands={brands}
                        />
                    </section>
                )}

                {(category === 'all' || category === 'integrations') && (
                    <section id="integrations-section" className="transition-all contents">
                        <IntegrationsList
                            viewMode={viewMode}
                            searchQuery={searchQuery}
                            hideTitle={category !== 'integrations'}
                            selectedBrandId={selectedBrandId}
                            brands={brands}
                        />
                        <IntegrationHub
                            viewMode={viewMode}
                            searchQuery={searchQuery}
                            hideTitle={false}
                            selectedBrandId={selectedBrandId}
                        />
                    </section>
                )}
            </div>

            <div className="flex justify-center mt-8 pb-4">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-brand-strong">
                    Need another integration? Request it here →
                </Button>
            </div>

            {/* Create Brand Dialog */}
            <FormDialog
                open={showCreateBrand}
                onOpenChange={setShowCreateBrand}
                title="Create New Brand"
                description="Add a new brand to organize your social media connections."
                icon={Building2}
                submitLabel="Create Brand"
                submitting={isCreatingBrand}
                onSubmit={handleCreateBrand}
            >
                <Field label="Brand Name">
                    <Input
                        placeholder="e.g., My Awesome Brand"
                        value={newBrandName}
                        onChange={(e) => setNewBrandName(e.target.value)}
                    />
                </Field>
                <Field label="Handle" hint="Used as a unique identifier for your brand">
                    <Input
                        placeholder="e.g., myawesomebrand"
                        value={newBrandHandle}
                        onChange={(e) => setNewBrandHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    />
                </Field>
            </FormDialog>
        </div>
    );
}
