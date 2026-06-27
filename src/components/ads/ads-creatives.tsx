'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Copy, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
    Button,
    Card,
    Chip,
    CopyField,
    Field,
    Input,
    PageHeader,
    Segmented,
    Spinner,
    Textarea,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import type { AdsPlatform } from './ads-data';
import { AdImagePickerDialog } from './ad-image-picker-dialog';

interface MetaVariant {
    primaryText: string;
    headline: string;
    description: string;
}

interface CopyResult {
    google?: { headlines: string[]; descriptions: string[] };
    meta?: { variants: MetaVariant[] };
}

export function AdsCreatives() {
    const { currentBrandId } = useCurrentBrand();
    const { toast } = useToast();

    const [platform, setPlatform] = useState<AdsPlatform>('meta_ads');
    const [product, setProduct] = useState('');
    const [audience, setAudience] = useState('');
    const [tone, setTone] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<CopyResult | null>(null);

    // Image generation
    const [imagePreset, setImagePreset] = useState<'square' | 'story' | 'landscape'>('square');
    const [imageBusy, setImageBusy] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [imageSaved, setImageSaved] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    const generate = useCallback(async () => {
        if (!product.trim()) {
            toast({ variant: 'destructive', title: 'Describe what you are advertising first' });
            return;
        }
        setBusy(true);
        try {
            const response = await fetch('/api/v2/ads/generate-copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform,
                    product,
                    audience: audience.trim() || undefined,
                    tone: tone.trim() || undefined,
                    brandId: currentBrandId || undefined,
                    variants: 3,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Generation failed');
            setResult(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Generation failed';
            toast({ variant: 'destructive', title: 'Could not generate copy', description: message });
        } finally {
            setBusy(false);
        }
    }, [platform, product, audience, tone, currentBrandId, toast]);

    const generateImage = useCallback(async () => {
        if (!product.trim()) {
            toast({ variant: 'destructive', title: 'Describe what you are advertising first' });
            return;
        }
        setImageBusy(true);
        try {
            const response = await fetch('/api/v2/ads/generate-creative', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: product, preset: imagePreset, brandId: currentBrandId || undefined }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Generation failed');
            setImageUrl(data.imageUrl);
            setImageSaved(Boolean(data.savedToLibrary));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Generation failed';
            toast({ variant: 'destructive', title: 'Could not generate image', description: message });
        } finally {
            setImageBusy(false);
        }
    }, [product, imagePreset, currentBrandId, toast]);

    const copyText = useCallback(async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast({ title: 'Copied' });
        } catch {
            toast({ variant: 'destructive', title: 'Clipboard unavailable' });
        }
    }, [toast]);

    const generateImageAction = (
        <Button size="sm" variant="brand" icon={imageBusy ? undefined : Sparkles} disabled={imageBusy} onClick={generateImage}>
            {imageBusy ? <Spinner size={14} /> : null}
            Generate image
        </Button>
    );

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-6">
            <PageHeader
                icon={Sparkles}
                title="Ad Creatives"
                sub="Generate platform-ready ad copy in your brand voice"
            />

            <Card title="Copy generator" icon={Sparkles}>
                <div className="space-y-4">
                    <Segmented
                        value={platform}
                        onChange={(value) => { setPlatform(value as AdsPlatform); setResult(null); }}
                        options={[
                            { value: 'meta_ads', label: 'Meta Ads' },
                            { value: 'google_ads', label: 'Google RSA' },
                        ]}
                    />
                    <Field label="What are you advertising?" hint="Product, offer, or landing page summary.">
                        <Textarea value={product} onChange={(event) => setProduct(event.target.value)} rows={3} />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Audience (optional)">
                            <Input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="e.g. small agency owners" />
                        </Field>
                        <Field label="Tone override (optional)" hint="Defaults to your brand voice.">
                            <Input value={tone} onChange={(event) => setTone(event.target.value)} placeholder="e.g. playful, direct" />
                        </Field>
                    </div>
                    <Button variant="brand" icon={busy ? undefined : Sparkles} disabled={busy} onClick={generate}>
                        {busy ? <Spinner size={14} /> : null}
                        Generate copy
                    </Button>
                </div>
            </Card>

            {result?.meta && (
                <div className="space-y-3">
                    {result.meta.variants.map((variant, index) => {
                        const variantAction = (
                            <Button
                                size="sm"
                                variant="outline"
                                icon={Copy}
                                onClick={() => copyText(`${variant.primaryText}\n\nHeadline: ${variant.headline}\nDescription: ${variant.description}`)}
                            >
                                Copy all
                            </Button>
                        );
                        return (
                        <Card key={variant.primaryText || index} title={`Variant ${index + 1}`} action={variantAction}>
                            <div className="space-y-2 text-sm">
                                <p className="whitespace-pre-wrap">{variant.primaryText}</p>
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    <Chip tone="gray">Headline: {variant.headline}</Chip>
                                    <Chip tone="gray">Description: {variant.description}</Chip>
                                </div>
                            </div>
                        </Card>
                        );
                    })}
                </div>
            )}

            {result?.google && (() => {
                const googleCopyAction = (
                    <Button
                        size="sm"
                        variant="outline"
                        icon={Copy}
                        onClick={() => copyText(
                            `Headlines:\n${result.google!.headlines.join('\n')}\n\nDescriptions:\n${result.google!.descriptions.join('\n')}`,
                        )}
                    >
                        Copy all
                    </Button>
                );
                return (
                <Card title="RSA assets" action={googleCopyAction}>
                    <div className="grid gap-6 sm:grid-cols-2">
                        <div>
                            <h4 className="mb-2 text-sm font-semibold">Headlines ({result.google.headlines.length})</h4>
                            <ul className="space-y-1.5">
                                {result.google.headlines.map((headline) => (
                                    <li key={headline} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                                        <span className="truncate">{headline}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground">{headline.length}/30</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="mb-2 text-sm font-semibold">Descriptions ({result.google.descriptions.length})</h4>
                            <ul className="space-y-1.5">
                                {result.google.descriptions.map((description) => (
                                    <li key={description} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                                        <span>{description}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground">{description.length}/90</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </Card>
                );
            })()}

            <Card
                icon={ImageIcon}
                title="Ad images"
                action={generateImageAction}
            >
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Generates from the product description above at a platform-ready size. The URL stays valid
                        long enough to create the campaign — ad platforms cache the image on creation.
                    </p>
                    <Segmented
                        value={imagePreset}
                        onChange={(value) => setImagePreset(value as typeof imagePreset)}
                        options={[
                            { value: 'square', label: 'Feed 1:1' },
                            { value: 'story', label: 'Story 9:16' },
                            { value: 'landscape', label: 'Link ad 16:9' },
                        ]}
                    />
                    {imageUrl && (
                        <div className="space-y-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={imageUrl} alt="Generated ad creative" className="max-h-72 rounded-lg border border-border object-contain" />
                            <div className="flex items-center gap-2">
                                <CopyField value={imageUrl} className="flex-1" />
                                {imageSaved && <Chip tone="ok" dot>Saved to library</Chip>}
                            </div>
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                            Need finer control (reference images, model choice)? <Link href="/ai-studio?mode=image" className="text-brand-strong hover:underline">Open AI Studio</Link>.
                        </p>
                        <Button variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
                            Browse library
                        </Button>
                    </div>
                </div>
            </Card>

            <AdImagePickerDialog
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                brandId={currentBrandId}
                onSelect={(url) => { setImageUrl(url); setImageSaved(true); }}
            />
        </div>
    );
}
