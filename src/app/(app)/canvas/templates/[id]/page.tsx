'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import useSWR from 'swr';
import {
    ArrowLeft,
    BadgeCheck,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Download,
    Layers,
    Tag,
    Workflow,
    Zap,
} from 'lucide-react';
import {
    Button,
    Card,
    Chip,
    Avatar,
    Skeleton,
    EmptyState,
    Spinner,
} from '@/components/ui-kit';
import type { ChipTone } from '@/components/ui-kit';
import { useAppHeader } from '@/components/app-header';
import { VerifiedBadge } from '@/components/canvas/templates/verified-badge';
import { TemplateRating } from '@/components/canvas/templates/template-rating';
import { ReviewSection } from '@/components/canvas/templates/review-section';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TemplateDetail {
    _id: string;
    name: string;
    description: string;
    longDescription?: string;
    category: string;
    difficulty: string;
    tags: string[];
    previewImageUrl?: string;
    screenshots: string[];
    useCases: string[];
    requirements: string[];
    compatibleTriggers: string[];
    version: string;
    authorName: string;
    usageCount: number;
    rating: number;
    ratingCount: number;
    isFeatured: boolean;
    isOfficial: boolean;
    source: string;
    isBuiltIn: boolean;
    stepCount: number;
    setupTime?: number;
    createdAt?: string;
    updatedAt?: string;
    status?: string;
    rejectionReason?: string;
    flowData?: Record<string, unknown>;
}

const fetcher = async (url: string) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Not found');
    }
    return res.json();
};

function getDifficultyTone(difficulty?: string): ChipTone {
    switch (difficulty) {
        case 'advanced': return 'danger';
        case 'intermediate': return 'warn';
        default: return 'ok';
    }
}

function formatLabel(value?: string) {
    if (!value) return '';
    return value.split(/[_-]/g).filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function TemplateScreenshotGallery({
    images,
    screenshotIndex,
    onIndexChange,
    templateName,
}: {
    images: string[];
    screenshotIndex: number;
    onIndexChange: (updater: (i: number) => number) => void;
    templateName: string;
}) {
    if (images.length === 0) {
        return (
            <div className="flex aspect-[16/7] items-center justify-center rounded-lg border border-border bg-muted/10">
                <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                    <Workflow className="size-10" />
                    <p className="text-[12px]">No preview available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden rounded-lg border border-border bg-muted/20">
            <div className="relative aspect-[16/7] w-full overflow-hidden">
                <Image
                    src={images[screenshotIndex]}
                    alt={`${templateName} screenshot ${screenshotIndex + 1}`}
                    fill
                    className="object-cover"
                    unoptimized
                />
            </div>
            {images.length > 1 && (
                <>
                    <button
                        type="button"
                        onClick={() => onIndexChange((i) => Math.max(0, i - 1))}
                        disabled={screenshotIndex === 0}
                        className="absolute left-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-30"
                    >
                        <ChevronLeft className="size-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onIndexChange((i) => Math.min(images.length - 1, i + 1))}
                        disabled={screenshotIndex === images.length - 1}
                        className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-30"
                    >
                        <ChevronRight className="size-4" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                        {images.map((_, i) => (
                            <button
                                type="button"
                                key={`dot-${i}`}
                                onClick={() => onIndexChange(() => i)}
                                className={cn(
                                    'h-1.5 rounded-full transition-all',
                                    i === screenshotIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                                )}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default function TemplateDetailPage() {
    const params = useParams();
    const { push } = useRouter();
    const { data: session } = useSession();
    const { setHeaderInfo } = useAppHeader();
    const { toast } = useToast();

    const id = params.id as string;
    const { data, isLoading, error } = useSWR<{ template: TemplateDetail }>(
        `/api/v2/canvas-templates/${id}`,
        fetcher
    );

    const template = data?.template;
    const [screenshotIndex, setScreenshotIndex] = useState(0);
    const [isInstalling, setIsInstalling] = useState(false);

    useEffect(() => {
        setHeaderInfo({
            type: 'page',
            title: template?.name || 'Template',
            backHref: '/canvas/templates',
        });
        return () => setHeaderInfo(null);
    }, [template?.name, setHeaderInfo]);

    // All images to display (previewImageUrl + screenshots)
    const allImages = [
        ...(template?.previewImageUrl ? [template.previewImageUrl] : []),
        ...(template?.screenshots || []),
    ];

    const handleInstall = async () => {
        if (!session) { push('/login'); return; }
        try {
            setIsInstalling(true);
            const res = await fetch(`/api/v2/canvas-templates/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ canvasName: `${template?.name} (Copy)` }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to install');
            }
            const result = await res.json();
            toast({ title: 'Template installed', description: `Canvas "${result.canvas.name}" created.` });
            push(`/canvas/${result.canvas.id}`);
        } catch (e: unknown) {
            toast({ variant: 'destructive', title: 'Install failed', description: e instanceof Error ? e.message : 'Unknown error' });
            setIsInstalling(false);
        }
    };

    if (isLoading) {
        return (
            <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
                <Skeleton className="h-[320px] w-full" />
                <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                    <div className="space-y-4">
                        <Skeleton className="h-8 w-2/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="size-4/5" />
                    </div>
                    <Skeleton className="h-64" />
                </div>
            </div>
        );
    }

    if (error || !template) {
        return (
            <div className="py-16">
                <EmptyState
                    icon={Workflow}
                    title="Template not found"
                    note={error?.message || 'This template may have been removed or is private.'}
                    cta={
                        <Button asChild variant="outline" size="sm" icon={ArrowLeft}>
                            <Link href="/canvas/templates">Back to templates</Link>
                        </Button>
                    }
                />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl space-y-5 px-4 py-4 pb-16">
            {/* Screenshot gallery */}
            <TemplateScreenshotGallery
                images={allImages}
                screenshotIndex={screenshotIndex}
                onIndexChange={setScreenshotIndex}
                templateName={template.name}
            />

            {/* Main content + sidebar */}
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
                {/* Left: details */}
                <div className="space-y-5">
                    {/* Name + badges */}
                    <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h1 className="text-[22px] font-bold text-foreground">{template.name}</h1>
                            {template.isOfficial && <VerifiedBadge size="md" />}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip tone={getDifficultyTone(template.difficulty)}>
                                {formatLabel(template.difficulty)}
                            </Chip>
                            <Chip tone="gray">{formatLabel(template.category)}</Chip>
                            {template.isFeatured && <Chip tone="warn">Featured</Chip>}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <TemplateRating rating={template.rating} ratingCount={template.ratingCount} size="sm" />
                            <span className="text-[11px] text-muted-foreground">·</span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Download className="size-3" />
                                {template.usageCount.toLocaleString()} installs
                            </span>
                        </div>
                    </div>

                    <div className="h-px bg-border" />

                    {/* About */}
                    <div>
                        <h2 className="mb-2 text-[14px] font-semibold text-foreground">About this template</h2>
                        <p className="text-[13px] leading-relaxed text-muted-foreground">{template.description}</p>
                        {template.longDescription && (
                            <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                                {template.longDescription}
                            </p>
                        )}
                    </div>

                    {/* Use cases */}
                    {template.useCases && template.useCases.length > 0 && (
                        <div>
                            <h2 className="mb-2 text-[14px] font-semibold text-foreground">What you can do with it</h2>
                            <ul className="space-y-1.5">
                                {template.useCases.map((uc) => (
                                    <li key={uc} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                                        <Zap className="mt-0.5 size-3.5 flex-shrink-0 text-brand-strong" />
                                        {uc}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Requirements */}
                    {template.requirements && template.requirements.length > 0 && (
                        <div>
                            <h2 className="mb-2 text-[14px] font-semibold text-foreground">Requirements</h2>
                            <ul className="space-y-1.5">
                                {template.requirements.map((req) => (
                                    <li key={req} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                                        <span className="mt-1 size-1.5 flex-shrink-0 rounded-full bg-muted-foreground/60" />
                                        {req}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Tags */}
                    {template.tags && template.tags.length > 0 && (
                        <div>
                            <h2 className="mb-2 text-[14px] font-semibold text-foreground">Tags</h2>
                            <div className="flex flex-wrap gap-1.5">
                                {template.tags.map((tag) => (
                                    <Link key={tag} href={`/canvas/templates?tags=${encodeURIComponent(tag)}`}>
                                        <Chip tone="gray" icon={Tag} className="cursor-pointer transition-opacity hover:opacity-80">
                                            {tag}
                                        </Chip>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="h-px bg-border" />

                    {/* Reviews */}
                    <div>
                        <h2 className="mb-4 text-[14px] font-semibold text-foreground">Reviews</h2>
                        <ReviewSection
                            templateId={id}
                            templateRating={template.rating}
                            templateRatingCount={template.ratingCount}
                        />
                    </div>
                </div>

                {/* Right: install sidebar */}
                <div className="space-y-4">
                    {/* Install CTA */}
                    <Card className="sticky top-4">
                        <div className="space-y-3 p-4">
                            <Button
                                variant="brand"
                                onClick={handleInstall}
                                disabled={isInstalling}
                                icon={isInstalling ? undefined : Download}
                                className="w-full"
                            >
                                {isInstalling ? (
                                    <><Spinner size={14} className="border-current" />Installing…</>
                                ) : (
                                    'Use Template'
                                )}
                            </Button>

                            <div className="h-px bg-border" />

                            {/* Author */}
                            <div className="flex items-center gap-2">
                                <Avatar name={template.authorName} size={32} />
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Built by</p>
                                    <div className="flex items-center gap-1">
                                        <p className="text-[13px] font-semibold text-foreground">{template.authorName}</p>
                                        {template.isOfficial && <BadgeCheck className="size-3.5 text-info" />}
                                    </div>
                                </div>
                            </div>

                            <div className="h-px bg-border" />

                            {/* Stats grid */}
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Downloads', value: template.usageCount.toLocaleString(), Icon: Download },
                                    { label: 'Steps', value: template.stepCount, Icon: Layers },
                                    { label: 'Setup', value: template.setupTime ? `${template.setupTime} min` : 'Quick', Icon: Clock3 },
                                    { label: 'Difficulty', value: formatLabel(template.difficulty), Icon: Zap },
                                    { label: 'Category', value: formatLabel(template.category), Icon: Workflow },
                                    { label: 'Version', value: template.version, Icon: Tag },
                                ].map(({ label, value, Icon }) => (
                                    <div key={label} className="rounded-md border border-border bg-muted/10 px-2.5 py-2">
                                        <div className="mb-0.5 flex items-center gap-1">
                                            <Icon className="size-2.5 text-muted-foreground" />
                                            <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                                        </div>
                                        <p className="truncate text-[12px] font-semibold text-foreground">{value}</p>
                                    </div>
                                ))}
                            </div>

                            {template.createdAt && (
                                <p className="text-center text-[10px] text-muted-foreground">
                                    Published {new Date(template.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                            )}
                        </div>
                    </Card>

                    {/* Browse more */}
                    <Button asChild variant="outline" size="sm" icon={ArrowLeft} className="w-full">
                        <Link href="/canvas/templates">Browse all templates</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
