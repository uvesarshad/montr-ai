'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FormExtensions } from './extensions';
import { useFormSubmission } from './form-context';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { evaluateConditions } from './condition-builder';

type ConditionalNode = {
    attrs?: {
        conditions?: unknown;
    };
};

export const FormRenderer = ({
    content,
    formId,
    submitLabel = 'Submit',
    thankYouMessage = 'Your submission has been received.'
}: {
    content: string;
    formId: string;
    submitLabel?: string;
    thankYouMessage?: string;
}) => {
    const { answers, isSubmitting, setIsSubmitting } = useFormSubmission()!;
    const { toast } = useToast();
    const [submitted, setSubmitted] = useState(false);
    const [successMessage, setSuccessMessage] = useState(thankYouMessage);

    let initialContent: string | object = content;
    try {
        initialContent = JSON.parse(content);
    } catch {
        initialContent = content;
    }

    const editor = useEditor({
        editable: false,
        extensions: [
            StarterKit,
            ...FormExtensions,
        ],
        content: initialContent,
        editorProps: {
            attributes: {
                class: 'prose prose-stone dark:prose-invert max-w-none pb-2 text-[15px] leading-7 outline-none focus:outline-none',
            },
        },
    });

    useEffect(() => {
        if (!editor) {
            return;
        }

        const json = editor.getJSON();

        json.content?.forEach((node, index: number) => {
            const conditions = (node as ConditionalNode).attrs?.conditions;
            if (Array.isArray(conditions)) {
                const shouldShow = evaluateConditions(conditions, answers);
                const editorElement = editor.view.dom;
                const nodeElements = editorElement.querySelectorAll('[data-node-view-wrapper]');

                if (nodeElements[index]) {
                    const element = nodeElements[index] as HTMLElement;
                    element.style.display = shouldShow ? '' : 'none';
                }
            }
        });
    }, [editor, answers]);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/public/forms/${formId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: answers })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Submission failed');
            }

            setSubmitted(true);
            setSuccessMessage(result.message || thankYouMessage);
            toast({ title: 'Success', description: result.message });

            if (result.redirectUrl) {
                window.location.href = result.redirectUrl;
            }
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Submission failed'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!editor) {
        return null;
    }

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center space-y-4 rounded-[12px] border bg-card p-12 text-center shadow-sm">
                <div className="flex size-14 items-center justify-center rounded-[12px] border border-emerald-500/15 bg-emerald-500/10 text-emerald-600">
                    <CheckCircle2 className="size-7" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">Thanks, you&apos;re all set.</h2>
                <p className="max-w-md text-sm text-muted-foreground">{successMessage}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-[12px] border bg-card px-4 py-4 shadow-sm sm:px-6 sm:py-6">
                <EditorContent
                    editor={editor}
                    className="[&_.ProseMirror]:min-h-[320px] [&_.ProseMirror]:focus:outline-none"
                />
            </div>

            <div className="rounded-[12px] border bg-card px-4 py-4 shadow-sm sm:px-6">
                <Button
                    size="lg"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="min-w-[140px] rounded-[0.4rem] sm:w-auto"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Sending...
                        </>
                    ) : submitLabel}
                </Button>
            </div>
        </div>
    );
};
