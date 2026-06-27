'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { FormExtensions } from './extensions';
import { SlashCommand } from './slash-command';
import { TrailingNode } from './trailing-node';
import { useEffect } from 'react';
import { Rows3, SlashIcon } from 'lucide-react';

export const FormEditor = ({
    initialContent,
    onChange
}: {
    initialContent: string;
    onChange: (content: string) => void;
}) => {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3],
                },
            }),
            Placeholder.configure({
                placeholder: ({ node }) => {
                    if (node.type.name === 'heading') {
                        return `Heading ${node.attrs.level}`;
                    }
                    return "Type '/' to insert blocks...";
                },
            }),
            SlashCommand,
            TrailingNode,
            ...FormExtensions,
        ],
        content: initialContent,
        editorProps: {
            attributes: {
                class:
                    'prose prose-stone dark:prose-invert max-w-none min-h-[560px] text-[15px] leading-7 outline-none focus:outline-none',
            },
        },
        onUpdate: ({ editor }) => {
            onChange(JSON.stringify(editor.getJSON()));
        },
    });

    useEffect(() => {
        if (!editor || !initialContent) {
            return;
        }

        try {
            const currentJSON = JSON.stringify(editor.getJSON());
            if (initialContent !== currentJSON && initialContent !== '') {
                const content = JSON.parse(initialContent);
                editor.commands.setContent(content, false);
            }
        } catch {
            // Older content can still be stored as a non-JSON string.
        }
    }, [initialContent, editor]);

    if (!editor) {
        return null;
    }

    return (
        <div className="rounded-[12px] border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-[12px] border border-primary/15 bg-primary/10 text-primary">
                        <Rows3 className="size-4" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold">Form Canvas</p>
                        <p className="text-xs text-muted-foreground">Use `/` to insert fields and layout blocks.</p>
                    </div>
                </div>
                <div className="hidden items-center gap-2 text-[11px] font-medium text-muted-foreground sm:flex">
                    <span className="rounded-[12px] border bg-background px-2.5 py-1">Structured blocks</span>
                    <span className="rounded-[12px] border bg-background px-2.5 py-1">Conditional logic</span>
                    <span className="inline-flex items-center gap-1 rounded-[12px] border bg-background px-2.5 py-1">
                        <SlashIcon className="size-3" />
                        Quick insert
                    </span>
                </div>
            </div>

            <div className="px-4 py-4 sm:px-5 sm:py-5">
                <div className="rounded-[12px] border bg-background px-5 py-5 shadow-inner sm:px-8 sm:py-7">
                    <EditorContent
                        editor={editor}
                        className="min-h-[560px] [&_.ProseMirror]:min-h-[560px] [&_.ProseMirror]:focus:outline-none"
                    />
                </div>
            </div>
        </div>
    );
};
