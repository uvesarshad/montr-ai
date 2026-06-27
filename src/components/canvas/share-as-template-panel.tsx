'use client';

import { useState } from 'react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import {
    Button,
    Chip,
    Field,
    Input,
    Select,
    Textarea,
} from '@/components/ui-kit';
import { Banner } from '@/components/ui-kit';
import { Info, Loader2, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TEMPLATE_CATEGORIES, TEMPLATE_DIFFICULTIES } from '@/lib/db/models/canvas-template.model';

interface ShareAsTemplatePanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    canvasId: string;
    canvasName?: string;
}

function formatLabel(value: string) {
    return value.split(/[_-]/g).filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export function ShareAsTemplatePanel({
    open,
    onOpenChange,
    canvasId,
    canvasName,
}: ShareAsTemplatePanelProps) {
    const { toast } = useToast();

    const [name, setName] = useState(canvasName || '');
    const [description, setDescription] = useState('');
    const [longDescription, setLongDescription] = useState('');
    const [category, setCategory] = useState('');
    const [difficulty, setDifficulty] = useState('beginner');
    const [tagInput, setTagInput] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [useCaseInput, setUseCaseInput] = useState('');
    const [useCases, setUseCases] = useState<string[]>([]);
    const [reqInput, setReqInput] = useState('');
    const [requirements, setRequirements] = useState<string[]>([]);
    const [screenshotInput, setScreenshotInput] = useState('');
    const [screenshots, setScreenshots] = useState<string[]>([]);
    const [_submitPublic, _setSubmitPublic] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const addTag = () => {
        const t = tagInput.trim().toLowerCase();
        if (t && !tags.includes(t) && tags.length < 10) {
            setTags([...tags, t]);
            setTagInput('');
        }
    };

    const addUseCase = () => {
        const v = useCaseInput.trim();
        if (v && !useCases.includes(v) && useCases.length < 5) {
            setUseCases([...useCases, v]);
            setUseCaseInput('');
        }
    };

    const addRequirement = () => {
        const v = reqInput.trim();
        if (v && !requirements.includes(v) && requirements.length < 5) {
            setRequirements([...requirements, v]);
            setReqInput('');
        }
    };

    const addScreenshot = () => {
        const v = screenshotInput.trim();
        if (v && !screenshots.includes(v) && screenshots.length < 5) {
            try { new URL(v); } catch { return; }
            setScreenshots([...screenshots, v]);
            setScreenshotInput('');
        }
    };

    const handleSubmit = async (isPublic: boolean) => {
        if (!name.trim() || !description.trim() || !category) {
            toast({ variant: 'destructive', title: 'Please fill in name, description and category.' });
            return;
        }

        try {
            setIsSubmitting(true);
            const res = await fetch('/api/v2/canvas-templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    canvasId,
                    name: name.trim(),
                    description: description.trim(),
                    longDescription: longDescription.trim() || undefined,
                    category,
                    difficulty,
                    tags,
                    screenshots,
                    useCases,
                    requirements,
                    isPublic,
                }),
            });

            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || 'Failed to save template');
            }

            const result = await res.json();

            toast({
                title: isPublic ? 'Submitted for review' : 'Template saved as draft',
                description: result.message,
            });

            onOpenChange(false);
            // Reset form
            setName('');
            setDescription('');
            setLongDescription('');
            setCategory('');
            setDifficulty('beginner');
            setTags([]);
            setScreenshots([]);
            setScreenshotInput('');
            setUseCases([]);
            setRequirements([]);
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto">
                <SheetHeader className="mb-5">
                    <SheetTitle>Share as Template</SheetTitle>
                    <SheetDescription>
                        Package this canvas as a reusable template for yourself or the community.
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-4">
                    {/* Name */}
                    <Field label="Template name" required htmlFor="tpl-name">
                        <Input
                            id="tpl-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Lead Nurture Sequence"
                            maxLength={100}
                        />
                    </Field>

                    {/* Short description */}
                    <Field label="Short description" required htmlFor="tpl-desc">
                        <Textarea
                            id="tpl-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe what this template does in 1–2 sentences."
                            maxLength={500}
                            rows={2}
                            className="resize-none"
                        />
                        <p className="text-[10px] text-muted-foreground text-right">{description.length}/500</p>
                    </Field>

                    {/* Category + difficulty */}
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Category" required htmlFor="tpl-category">
                            <Select
                                value={category}
                                onChange={setCategory}
                                placeholder="Select category"
                                options={TEMPLATE_CATEGORIES.map((c) => ({ value: c, label: formatLabel(c) }))}
                            />
                        </Field>
                        <Field label="Difficulty" htmlFor="tpl-difficulty">
                            <Select
                                value={difficulty}
                                onChange={setDifficulty}
                                options={TEMPLATE_DIFFICULTIES.map((d) => ({ value: d, label: formatLabel(d) }))}
                            />
                        </Field>
                    </div>

                    {/* Tags */}
                    <Field label="Tags (up to 10)" htmlFor="tpl-tags">
                        <div className="flex gap-2">
                            <Input
                                id="tpl-tags"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                                placeholder="Add a tag and press Enter"
                            />
                            <Button type="button" variant="outline" size="sm" icon={Plus} onClick={addTag} />
                        </div>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {tags.map((tag) => (
                                    <Chip
                                        key={tag}
                                        tone="gray"
                                        icon={X}
                                        onClick={() => setTags(tags.filter((t) => t !== tag))}
                                    >
                                        {tag}
                                    </Chip>
                                ))}
                            </div>
                        )}
                    </Field>

                    {/* Use cases */}
                    <Field label="Use cases (up to 5)" htmlFor="tpl-usecases">
                        <div className="flex gap-2">
                            <Input
                                id="tpl-usecases"
                                value={useCaseInput}
                                onChange={(e) => setUseCaseInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUseCase(); } }}
                                placeholder="e.g. Onboard new leads automatically"
                            />
                            <Button type="button" variant="outline" size="sm" icon={Plus} onClick={addUseCase} />
                        </div>
                        {useCases.length > 0 && (
                            <ul className="mt-1.5 space-y-1">
                                {useCases.map((uc) => (
                                    <li key={uc} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
                                        <span className="text-[12px] text-muted-foreground">{uc}</span>
                                        <button type="button" onClick={() => setUseCases(useCases.filter((u) => u !== uc))} className="ml-2 text-muted-foreground hover:text-destructive">
                                            <X className="size-3" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Field>

                    {/* Requirements */}
                    <Field label="Requirements (up to 5)" htmlFor="tpl-reqs">
                        <div className="flex gap-2">
                            <Input
                                id="tpl-reqs"
                                value={reqInput}
                                onChange={(e) => setReqInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRequirement(); } }}
                                placeholder="e.g. WhatsApp account connected"
                            />
                            <Button type="button" variant="outline" size="sm" icon={Plus} onClick={addRequirement} />
                        </div>
                        {requirements.length > 0 && (
                            <ul className="mt-1.5 space-y-1">
                                {requirements.map((req) => (
                                    <li key={req} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
                                        <span className="text-[12px] text-muted-foreground">{req}</span>
                                        <button type="button" onClick={() => setRequirements(requirements.filter((r) => r !== req))} className="ml-2 text-muted-foreground hover:text-destructive">
                                            <X className="size-3" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Field>

                    {/* Screenshots */}
                    <Field label="Screenshot URLs (optional, up to 5)" htmlFor="tpl-screenshots">
                        <div className="flex gap-2">
                            <Input
                                id="tpl-screenshots"
                                value={screenshotInput}
                                onChange={(e) => setScreenshotInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addScreenshot(); } }}
                                placeholder="https://example.com/screenshot.png"
                            />
                            <Button type="button" variant="outline" size="sm" icon={Plus} onClick={addScreenshot} />
                        </div>
                        {screenshots.length > 0 && (
                            <ul className="mt-1.5 space-y-1">
                                {screenshots.map((url, i) => (
                                    <li key={url} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
                                        <span className="text-[11px] text-muted-foreground truncate flex-1 mr-2">Screenshot {i + 1}</span>
                                        <button type="button" onClick={() => setScreenshots(screenshots.filter((s) => s !== url))} className="flex-shrink-0 text-muted-foreground hover:text-destructive">
                                            <X className="size-3" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Field>

                    {/* Long description */}
                    <Field label="Detailed description (optional)" htmlFor="tpl-longdesc">
                        <Textarea
                            id="tpl-longdesc"
                            value={longDescription}
                            onChange={(e) => setLongDescription(e.target.value)}
                            placeholder="Add more context, setup instructions, or tips for users of this template."
                            maxLength={2000}
                            rows={4}
                            className="resize-none"
                        />
                        <p className="text-[10px] text-muted-foreground text-right">{longDescription.length}/2000</p>
                    </Field>

                    {/* Info banner */}
                    <Banner tone="info" icon={Info}>
                        Community submissions are reviewed before going public. You can save as draft and submit later from My Templates.
                    </Banner>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 pt-1">
                        <Button
                            variant="brand"
                            onClick={() => handleSubmit(true)}
                            disabled={isSubmitting}
                            className="w-full"
                        >
                            {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                            Submit for community review
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleSubmit(false)}
                            disabled={isSubmitting}
                            className="w-full"
                        >
                            Save as private draft
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
