'use client';

import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { IFormData } from '@/hooks/use-forms';
import { useState } from 'react';
import {
    BellRing,
    Check,
    Code,
    Copy,
    ExternalLink,
    Globe2,
    Loader2,
    MessageSquareText
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface FormSettingsProps {
    form: IFormData;
    onUpdate: (updates: Partial<IFormData>) => Promise<unknown>;
}

interface SettingsFormData {
    title: string;
    description: string;
    submitButtonText: string;
    thankYouMessage: string;
    thankYouUrl: string;
    emailNotifications: boolean;
}

export function FormSettings({ form, onUpdate }: FormSettingsProps) {
    const { register, handleSubmit, watch, setValue, formState: { isDirty } } = useForm<SettingsFormData>({
        defaultValues: {
            title: form.title,
            description: form.settings?.description || '',
            submitButtonText: form.settings?.submitButtonText || 'Submit',
            thankYouMessage: form.settings?.thankYouMessage || 'Thank you for your submission!',
            thankYouUrl: form.settings?.thankYouUrl || '',
            emailNotifications: form.settings?.emailNotifications || false,
        }
    });

    const [isSaving, setIsSaving] = useState(false);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const { toast } = useToast();

    const onSubmit = async (data: SettingsFormData) => {
        setIsSaving(true);
        try {
            await onUpdate({
                title: data.title,
                settings: {
                    ...form.settings,
                    description: data.description,
                    submitButtonText: data.submitButtonText,
                    thankYouMessage: data.thankYouMessage,
                    thankYouUrl: data.thankYouUrl,
                    emailNotifications: data.emailNotifications,
                }
            });
            toast({ title: 'Settings saved' });
        } catch {
            toast({ title: 'Failed to save settings', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopyCode = (code: string, type: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(type);
        toast({ title: 'Copied to clipboard!' });
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const publicId = form.slug || form._id;
    const formUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/f/${publicId}`
        : `https://yourdomain.com/f/${publicId}`;

    const iframeCode = `<iframe src="${formUrl}" width="100%" height="600" frameborder="0"></iframe>`;

    const scriptCode = `<div id="montrai-form-${form._id}"></div>
<script>
  (function() {
    var iframe = document.createElement('iframe');
    iframe.src = '${formUrl}';
    iframe.width = '100%';
    iframe.height = '600';
    iframe.frameBorder = '0';
    document.getElementById('montrai-form-${form._id}').appendChild(iframe);
  })();
</script>`;

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-4">
            <div className="rounded-[12px] border bg-card p-4">
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[12px] border border-primary/15 bg-primary/10 text-primary">
                        <Globe2 className="size-4" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold">Public Identity</p>
                        <p className="text-xs text-muted-foreground">Title, share description, and response behavior.</p>
                    </div>
                </div>

                <div className="grid gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Form Title</Label>
                        <Input id="title" className="rounded-[0.4rem]" {...register('title')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            className="min-h-[88px] rounded-[12px]"
                            rows={3}
                            {...register('description')}
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="submitButtonText">Submit Button</Label>
                            <Input
                                id="submitButtonText"
                                className="rounded-[0.4rem]"
                                {...register('submitButtonText')}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="thankYouUrl">Redirect URL</Label>
                            <Input
                                id="thankYouUrl"
                                className="rounded-[0.4rem]"
                                placeholder="https://example.com/thanks"
                                {...register('thankYouUrl')}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="thankYouMessage">Thank You Message</Label>
                        <Textarea
                            id="thankYouMessage"
                            className="min-h-[96px] rounded-[12px]"
                            rows={4}
                            {...register('thankYouMessage')}
                        />
                    </div>
                </div>
            </div>

            <div className="rounded-[12px] border bg-card p-4">
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[12px] border border-emerald-500/15 bg-emerald-500/10 text-emerald-600">
                        <BellRing className="size-4" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold">Notifications</p>
                        <p className="text-xs text-muted-foreground">Control how the team hears about new responses.</p>
                    </div>
                </div>

                <div className="flex items-center justify-between rounded-[12px] border bg-background px-4 py-4 shadow-sm">
                    <div className="space-y-1">
                        <Label className="text-sm font-medium">Email notifications</Label>
                        <p className="text-xs text-muted-foreground">
                            Send an email when someone submits this form.
                        </p>
                    </div>
                    <Switch
                        checked={watch('emailNotifications')}
                        onCheckedChange={(checked) => setValue('emailNotifications', checked, { shouldDirty: true })}
                    />
                </div>
            </div>

            {form.isPublished && (
                <div className="space-y-4 rounded-[12px] border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-[12px] border border-primary/15 bg-primary/10 text-primary">
                                <Code className="size-4" />
                            </div>
                            <div>
                                <Label className="text-sm font-semibold">Distribution</Label>
                                <p className="text-xs text-muted-foreground">Share the live form or embed it on another site.</p>
                            </div>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-[0.4rem]"
                            onClick={() => window.open(formUrl, '_blank')}
                        >
                            <ExternalLink className="mr-2 size-4" />
                            Open live form
                        </Button>
                    </div>

                    <div className="rounded-[12px] border bg-background p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            <MessageSquareText className="size-3.5" />
                            Public URL
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Input readOnly value={formUrl} className="rounded-[0.4rem]" />
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-[0.4rem]"
                                onClick={() => handleCopyCode(formUrl, 'url')}
                            >
                                {copiedCode === 'url' ? (
                                    <Check className="mr-2 size-4 text-emerald-500" />
                                ) : (
                                    <Copy className="mr-2 size-4" />
                                )}
                                Copy
                            </Button>
                        </div>
                    </div>

                    <Tabs defaultValue="iframe" className="w-full">
                        <TabsList className="grid h-auto w-full grid-cols-2 rounded-[12px] border bg-muted/40 p-1">
                            <TabsTrigger value="iframe" className="rounded-[0.4rem]">iFrame</TabsTrigger>
                            <TabsTrigger value="script" className="rounded-[0.4rem]">Script</TabsTrigger>
                        </TabsList>

                        <TabsContent value="iframe" className="space-y-2">
                            <div className="relative">
                                <pre className="overflow-x-auto rounded-[12px] border bg-background p-3 text-xs">
                                    <code>{iframeCode}</code>
                                </pre>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="absolute right-2 top-2 rounded-[0.4rem]"
                                    onClick={() => handleCopyCode(iframeCode, 'iframe')}
                                >
                                    {copiedCode === 'iframe' ? (
                                        <Check className="size-4 text-emerald-500" />
                                    ) : (
                                        <Copy className="size-4" />
                                    )}
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="script" className="space-y-2">
                            <div className="relative">
                                <pre className="max-h-[220px] overflow-x-auto rounded-[12px] border bg-background p-3 text-xs">
                                    <code>{scriptCode}</code>
                                </pre>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="absolute right-2 top-2 rounded-[0.4rem]"
                                    onClick={() => handleCopyCode(scriptCode, 'script')}
                                >
                                    {copiedCode === 'script' ? (
                                        <Check className="size-4 text-emerald-500" />
                                    ) : (
                                        <Copy className="size-4" />
                                    )}
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            )}

            <Button type="submit" disabled={!isDirty || isSaving} className="w-full rounded-[0.4rem]">
                {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save Changes
            </Button>
        </form>
    );
}
