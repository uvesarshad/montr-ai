'use client';

import Image from 'next/image';
import { FormSubmissionProvider } from '@/components/forms/form-context';
import { FormRenderer } from '@/components/forms/form-renderer';
import { ArrowUpRight, Globe2 } from 'lucide-react';

// Plain data shape — _id is always a string when coming from the API
type PublicFormRecord = {
    _id: string;
    title: string;
    content: string;
    slug: string;
    settings: {
        theme?: string;
        emailNotifications?: boolean;
        notificationEmail?: string;
        description?: string;
        submitButtonText?: string;
        thankYouMessage?: string;
        thankYouUrl?: string;
    };
    coverImage?: string | null;
};

export function PublicFormView({
    form
}: {
    form: PublicFormRecord
}) {
    return (
        <FormSubmissionProvider>
            <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef3ff_0%,#f8fafc_38%,#ffffff_100%)]">
                <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
                    <div className="overflow-hidden rounded-[12px] border bg-background/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                        {form.coverImage && (
                            <div className="relative h-48 w-full bg-muted sm:h-60">
                                <Image
                                    src={form.coverImage}
                                    alt="Cover"
                                    fill
                                    sizes="(max-width: 640px) 100vw, 56rem"
                                    className="object-cover"
                                    priority
                                />
                            </div>
                        )}

                        <div className="border-b px-5 py-5 sm:px-8 sm:py-7">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-700">
                                    <Globe2 className="size-3.5" />
                                    Live form
                                </span>
                            </div>

                            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                                {form.title}
                            </h1>

                            {form.settings?.description && (
                                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                                    {form.settings.description}
                                </p>
                            )}
                        </div>

                        <div className="px-4 py-4 sm:px-8 sm:py-8">
                            <FormRenderer
                                content={form.content}
                                formId={form._id}
                                submitLabel={form.settings?.submitButtonText}
                                thankYouMessage={form.settings?.thankYouMessage}
                            />
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                        <a href="https://www.montr.io" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-foreground transition-colors">
                            <span>Powered by Montr AI</span>
                            <ArrowUpRight className="size-3.5" />
                        </a>
                        <a href="https://app.montr.io/register" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                            Create form for free
                        </a>
                    </div>
                </div>
            </div>
        </FormSubmissionProvider>
    );
}
