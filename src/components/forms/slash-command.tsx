import React, { useEffect, useLayoutEffect, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance as TippyInstance, type GetReferenceClientRect } from "tippy.js";
import {
    Type,
    List,
    CheckSquare,
    Heading1,
    Heading2,
    MessageSquare,
    ChevronDown,
    AlignLeft,
    Calendar,
    Mail,
    List as ListIcon,
    Phone,
    Link,
    Star,
    Minus,
    Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
    onKeyDown?: (props: { event: Partial<KeyboardEvent> }) => boolean;
}

const CommandList = React.forwardRef<unknown, CommandListProps>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { items, command, onKeyDown } = props;

    const selectItem = (index: number) => {
        const item = items[index];
        if (item) {
            command(item);
        }
    };

    useEffect(() => {
        setSelectedIndex(0);
    }, [items]);

    useLayoutEffect(() => {
        onKeyDown?.({
            event: {
                key: 'Enter',
                preventDefault: () => { },
            } as Partial<KeyboardEvent>,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Expose methods to parent via ref (not strictly standard React but used by Tiptap renderer)
    React.useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === "ArrowUp") {
                setSelectedIndex((selectedIndex + items.length - 1) % items.length);
                return true;
            }
            if (event.key === "ArrowDown") {
                setSelectedIndex((selectedIndex + 1) % items.length);
                return true;
            }
            if (event.key === "Enter") {
                selectItem(selectedIndex);
                return true;
            }
            return false;
        },
    }));

    return (
        <div className="z-50 min-w-[300px] max-h-[330px] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md p-1">
            {items.length ? (
                items.map((item: CommandItem, index: number) => (
                    <Button
                        key={index}
                        variant="ghost"
                        onClick={() => selectItem(index)}
                        className={`w-full justify-start gap-2 px-2 py-1.5 text-sm ${index === selectedIndex ? "bg-accent text-accent-foreground" : ""
                            }`}
                    >
                        <div className="flex size-5 items-center justify-center rounded border bg-background">
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
const getSuggestionItems = ({ query }: { query: string }) => {
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
            title: "Short Text",
            description: "Single line input",
            icon: <MessageSquare size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formShortText' }).run();
            },
        },
        {
            title: "Multiple Choice",
            description: "Select one from list",
            icon: <List size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formMultipleChoice' }).run();
            },
        },
        {
            title: "Long Text",
            description: "Multi-line input",
            icon: <AlignLeft size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formLongText' }).run();
            },
        },
        {
            title: "Checkboxes",
            description: "Select multiple options",
            icon: <CheckSquare size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formCheckbox' }).run();
            },
        },
        {
            title: "Email",
            description: "Email address input",
            icon: <Mail size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formEmail' }).run();
            },
        },
        {
            title: "Date",
            description: "Date picker",
            icon: <Calendar size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formDate' }).run();
            },
        },
        {
            title: "Repeater Field",
            description: "Dynamic list of items",
            icon: <ListIcon size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formRepeater' }).run();
            },
        },
        {
            title: "Dropdown",
            description: "Select from dropdown",
            icon: <ChevronDown size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formDropdown' }).run();
            },
        },
        {
            title: "Phone Number",
            description: "Phone number input",
            icon: <Phone size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formPhone' }).run();
            },
        },
        {
            title: "URL / Link",
            description: "Website URL input",
            icon: <Link size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formURL' }).run();
            },
        },
        {
            title: "Rating",
            description: "Star rating input",
            icon: <Star size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formRating' }).run();
            },
        },
        {
            title: "Divider",
            description: "Visual separator",
            icon: <Minus size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formDivider' }).run();
            },
        },
        {
            title: "Image",
            description: "Add image with caption",
            icon: <ImageIcon size={14} />,
            command: ({ editor, range }: { editor: Editor; range: Range }) => {
                editor.chain().focus().deleteRange(range).insertContent({ type: 'formImage' }).run();
            },
        },
    ].filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
};


// --- The Extension ---
export const SlashCommand = Extension.create({
    name: "slashCommand",

    addOptions() {
        return {
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
                items: getSuggestionItems,
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
                            return (component.ref as { onKeyDown: (p: SuggestionKeyDownProps) => boolean } | null)?.onKeyDown(props) ?? false;
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
