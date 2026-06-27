import React, { useEffect, useRef, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance as TippyInstance, type GetReferenceClientRect } from "tippy.js";
import {
    Type,
    List,
    Heading1,
    Heading2,
    Heading3,
    Quote,
    CheckSquare,
    Code,
    Minus,
    Image as ImageIcon,
    FileText,
    ListOrdered,
    Table as TableIcon,
    Heading4,
    BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildSlashCommandFormEmbedAttrs } from "@/lib/docs/slash-command-form-embed";

// --- Command List Component ---
interface CommandItem {
    title: string;
    description: string;
    icon: React.ReactNode;
    command: (props: { editor: Editor; range: Range }) => void;
}

interface CommandListProps {
    items: CommandItem[];
    command: (item: CommandItem) => void;
}

const CommandList = React.forwardRef<unknown, CommandListProps>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement | null>(null);
    const { items, command } = props;

    const selectItem = (index: number) => {
        const item = items[index];
        if (item) {
            command(item);
        }
    };

    useEffect(() => {
        setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
        const activeItem = listRef.current?.querySelector<HTMLElement>(
            `[data-command-index="${selectedIndex}"]`
        );

        if (activeItem) {
            activeItem.scrollIntoView({
                block: "nearest",
            });
        }
    }, [selectedIndex]);

    React.useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (!items.length) {
                return false;
            }
            if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((selectedIndex + items.length - 1) % items.length);
                return true;
            }
            if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((selectedIndex + 1) % items.length);
                return true;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                selectItem(selectedIndex);
                return true;
            }
            return false;
        },
    }));

    return (
        <div
            ref={listRef}
            className="z-50 min-w-[240px] max-h-[360px] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
            {items.length ? (
                items.map((item: CommandItem, index: number) => (
                    <Button
                        key={index}
                        data-command-index={index}
                        variant="ghost"
                        onClick={() => selectItem(index)}
                        className={`w-full justify-start gap-2 px-2 py-1.5 text-sm ${index === selectedIndex ? "bg-accent text-accent-foreground" : ""
                            }`}
                    >
                        <div className="flex size-5 items-center justify-center rounded border bg-background text-muted-foreground">
                            {item.icon}
                        </div>
                        <div className="flex flex-col items-start gap-0.5">
                            <span className="font-medium leading-none">{item.title}</span>
                            <span className="text-xs text-muted-foreground leading-none">{item.description}</span>
                        </div>
                    </Button>
                ))
            ) : (
                <div className="px-2 py-1 text-sm text-muted-foreground">No matching commands</div>
            )}
        </div>
    );
});

CommandList.displayName = "CommandList";

// --- Define Commands ---
const getSuggestionItems = ({
    query,
    linkedFormId,
    linkedFormTitle,
}: {
    query: string;
    linkedFormId?: string | null;
    linkedFormTitle?: string | null;
}) => {
    return [
        {
            title: "Text",
            description: "Just plain text",
            icon: <Type size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).setParagraph().run();
            },
        },
        {
            title: "Heading 1",
            description: "Big section heading",
            icon: <Heading1 size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
            },
        },
        {
            title: "Heading 2",
            description: "Medium section heading",
            icon: <Heading2 size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
            },
        },
        {
            title: "Heading 3",
            description: "Small section heading",
            icon: <Heading3 size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
            },
        },
        {
            title: "Heading 4",
            description: "Compact section heading",
            icon: <Heading4 size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).setNode("heading", { level: 4 }).run();
            },
        },
        {
            title: "Bullet List",
            description: "Create a simple list",
            icon: <List size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).toggleBulletList().run();
            },
        },
        {
            title: "Ordered List",
            description: "Create a numbered list",
            icon: <ListOrdered size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).toggleOrderedList().run();
            },
        },
        {
            title: "Task List",
            description: "Track tasks with a todo list",
            icon: <CheckSquare size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).toggleTaskList().run();
            },
        },
        {
            title: "Quote",
            description: "Capture a quote",
            icon: <Quote size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).toggleBlockquote().run();
            },
        },
        {
            title: "Code Block",
            description: "Capture a code snippet",
            icon: <Code size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
            },
        },
        {
            title: "Divider",
            description: "Visually divide content",
            icon: <Minus size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).setHorizontalRule().run();
            },
        },
        {
            title: "Table",
            description: "Insert a 3x3 table",
            icon: <TableIcon size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            },
        },
        {
            title: "Image",
            description: "Upload or embed image",
            icon: <ImageIcon size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                // We're leaving this blank for now as image handling usually requires a dialog or file input
                // Ideally, this triggers the image dialog via a custom event or callback passed to the editor
                const url = window.prompt('Image URL');
                if (url) {
                    editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
                }
            },
        },
        {
            title: "Live Form",
            description: "Embed an interactive MontrAI form",
            icon: <FileText size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({
                    type: 'formEmbed',
                    attrs: buildSlashCommandFormEmbedAttrs({
                        displayMode: 'form',
                        linkedFormId,
                        linkedFormTitle,
                    }),
                }).insertContent({ type: 'paragraph' }).run();
            },
        },
        {
            title: "Form Summary",
            description: "Embed form stats and quick links",
            icon: <TableIcon size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({
                    type: 'formEmbed',
                    attrs: buildSlashCommandFormEmbedAttrs({
                        displayMode: 'summary',
                        linkedFormId,
                        linkedFormTitle,
                    }),
                }).insertContent({ type: 'paragraph' }).run();
            },
        },
        {
            title: "Latest Submissions",
            description: "Embed a live feed of recent responses",
            icon: <BarChart3 size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({
                    type: 'formEmbed',
                    attrs: buildSlashCommandFormEmbedAttrs({
                        displayMode: 'responses',
                        linkedFormId,
                        linkedFormTitle,
                    }),
                }).insertContent({ type: 'paragraph' }).run();
            },
        },
    ].filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
};

// --- The Extension ---
export const SlashCommand = Extension.create({
    name: "slashCommand",

    addOptions() {
        return {
            linkedFormId: null,
            linkedFormTitle: null,
            suggestion: {
                char: "/",
                command: ({ editor, range, props }: { editor: Editor; range: Range; props: CommandItem }) => {
                    props.command({ editor, range });
                },
            },
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
                items: ({ query }) =>
                    getSuggestionItems({
                        query,
                        linkedFormId: this.options.linkedFormId,
                        linkedFormTitle: this.options.linkedFormTitle,
                    }),
                render: () => {
                    let component: ReactRenderer;
                    let popup: TippyInstance[];

                    return {
                        onStart: (props: SuggestionProps) => {
                            component = new ReactRenderer(CommandList, {
                                props,
                                editor: props.editor,
                            });

                            if (!props.clientRect) {
                                return;
                            }

                            popup = tippy("body", {
                                getReferenceClientRect: props.clientRect as GetReferenceClientRect,
                                appendTo: () => document.body,
                                content: component.element,
                                showOnCreate: true,
                                interactive: true,
                                trigger: "manual",
                                placement: "bottom-start",
                            });
                        },

                        onUpdate: (props: SuggestionProps) => {
                            component.updateProps(props);
                            if (!props.clientRect) {
                                return;
                            }
                            popup[0].setProps({
                                getReferenceClientRect: props.clientRect as GetReferenceClientRect,
                            });
                        },

                        onKeyDown: (props: SuggestionKeyDownProps) => {
                            if (props.event.key === "Escape") {
                                popup[0].hide();
                                return true;
                            }
                            return (component.ref as { onKeyDown?: (p: SuggestionKeyDownProps) => boolean } | null)?.onKeyDown?.(props) ?? false;
                        },

                        onExit: () => {
                            popup[0].destroy();
                            component.destroy();
                        },
                    };
                },
            }),
        ];
    },
});
