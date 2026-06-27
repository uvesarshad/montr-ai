import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus, X, Circle, CheckSquare, Calendar, Mail, AlignLeft, UploadCloud, FileIcon, Loader2, List as ListIcon, GripVertical, Trash2, ChevronDown, Phone, Link as LinkIcon, Star, Image as ImageIcon, Settings2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { useFormSubmission } from './form-context';
import { ConditionBuilder, FieldCondition } from './condition-builder';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

function useDeferredNodeId(
    nodeId: string | null | undefined,
    isEditable: boolean,
    updateAttributes: (attrs: { id: string }) => void
) {
    const queuedRef = useRef(false);

    useEffect(() => {
        if (nodeId || !isEditable || queuedRef.current) {
            return;
        }

        let cancelled = false;
        queuedRef.current = true;

        queueMicrotask(() => {
            queuedRef.current = false;
            if (!cancelled) {
                updateAttributes({ id: nanoid(8) });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [nodeId, isEditable, updateAttributes]);
}

type FormNodeIcon = React.ComponentType<{ className?: string }>;

type FormNodeShape = {
    attrs: {
        id?: string | null;
        conditions?: FieldCondition[];
        [key: string]: unknown;
    };
};

// --- Shared Shell for Editable Nodes ---
const FormNodeShell = (({
    icon: Icon,
    title,
    node,
    updateAttributes,
    deleteNode,
    children,
    allFields = []
}: {
    icon: FormNodeIcon,
    title: string,
    node: FormNodeShape,
    updateAttributes: (attrs: Record<string, unknown>) => void,
    deleteNode: () => void,
    children: React.ReactNode,
    allFields?: Array<{ id: string; label: string; type: string }>
}) => {
    const [conditionsOpen, setConditionsOpen] = useState(false);
    const conditions = (node.attrs.conditions || []) as FieldCondition[];

    // Filter out current field from available fields
    const availableFields = allFields.filter(f => f.id !== node.attrs.id);

    return (
        <NodeViewWrapper className="group relative my-4 pl-10 pr-2">
            {/* Drag Handle & Delete Action */}
            <div className="absolute left-0 top-3 flex flex-col justify-start gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                <div
                    draggable="true"
                    data-drag-handle
                    className="cursor-grab p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
                >
                    <GripVertical className="size-4" />
                </div>
                <button
                    type="button"
                    onClick={deleteNode}
                    className="cursor-pointer p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-colors"
                    title="Delete Section"
                >
                    <Trash2 className="size-4" />
                </button>
            </div>

            <div className="border border-dashed border-muted-foreground/30 p-4 rounded-md bg-muted/5 hover:bg-muted/10 transition-colors">
                {/* Header */}
                <div className="text-sm text-muted-foreground mb-3 flex justify-between items-center select-none">
                    <span className="flex items-center gap-2 font-medium">
                        <Icon className="size-4" />
                        {title}
                    </span>
                    <label className="text-xs flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
                        <input
                            type="checkbox"
                            checked={!!node.attrs.required}
                            onChange={(e) => updateAttributes({ required: e.target.checked })}
                            className="rounded border-muted-foreground/40 text-primary focus:ring-primary"
                        />
                        Required
                    </label>
                </div>
                {/* Content */}
                {children}

                {/* Conditional Logic Section */}
                {availableFields.length > 0 && (
                    <Collapsible open={conditionsOpen} onOpenChange={setConditionsOpen} className="mt-3 pt-3 border-t">
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 text-xs w-full justify-start">
                                <Settings2 className="size-3 mr-1" />
                                Conditional Logic
                                {conditions.length > 0 && (
                                    <span className="ml-auto bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">
                                        {conditions.length}
                                    </span>
                                )}
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                            <ConditionBuilder
                                conditions={conditions}
                                availableFields={availableFields}
                                onChange={(newConditions) => updateAttributes({ conditions: newConditions })}
                            />
                        </CollapsibleContent>
                    </Collapsible>
                )}
            </div>
        </NodeViewWrapper>
    )
});


// --- Short Text Node ---
export const ShortTextNode = Node.create({
    name: 'formShortText',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'Short Text' },
            placeholder: { default: 'Short answer text' },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-short-text' }] },
    renderHTML({ HTMLAttributes }) { return ['form-short-text', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const context = useFormSubmission();
            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            if (isEditable) {
                return (
                    <FormNodeShell
                        icon={AlignLeft}
                        title="Short Text"
                        node={node}
                        updateAttributes={updateAttributes}
                        deleteNode={deleteNode}
                    >
                        <div className="space-y-3">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="font-medium text-sm" placeholder="Question / Label" />
                            <Input disabled placeholder={node.attrs.placeholder} className="bg-background shadow-sm" />
                        </div>
                    </FormNodeShell>
                );
            }

            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {node.attrs.label} {node.attrs.required && <span className="text-red-500">*</span>}
                        </label>
                        <Input
                            name={node.attrs.id}
                            placeholder={node.attrs.placeholder}
                            required={node.attrs.required}
                            onChange={(e) => context?.setAnswer(node.attrs.id, e.target.value)}
                        />
                    </div>
                </NodeViewWrapper>
            );
        })
    },
});

// --- Multiple Choice Node ---
export const MultipleChoiceNode = Node.create({
    name: 'formMultipleChoice',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'Multiple Choice' },
            options: { default: ['Option 1'] },
            required: { default: false },
            conditions: { default: [] },
            type: { default: 'radio' },
        }
    },
    parseHTML() { return [{ tag: 'form-multiple-choice' }] },
    renderHTML({ HTMLAttributes }) { return ['form-multiple-choice', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const options = node.attrs.options as string[];
            const context = useFormSubmission();

            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            const updateOption = (index: number, value: string) => {
                const newOptions = [...options];
                newOptions[index] = value;
                updateAttributes({ options: newOptions });
            };
            const addOption = () => updateAttributes({ options: [...options, `Option ${options.length + 1}`] });
            const removeOption = (index: number) => {
                if (options.length <= 1) return;
                updateAttributes({ options: options.filter((_, i) => i !== index) });
            };

            if (isEditable) {
                return (
                    <FormNodeShell
                        icon={ListIcon}
                        title="Multiple Choice"
                        node={node}
                        updateAttributes={updateAttributes}
                        deleteNode={deleteNode}
                    >
                        <div className="space-y-2">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="font-medium text-sm mb-2" placeholder="Question / Label" />
                            {options.map((opt, i) => (
                                <div key={`${i}-${opt}`} className="flex items-center gap-2">
                                    <Circle className="size-4 text-muted-foreground" />
                                    <Input value={opt} onChange={(e) => updateOption(i, e.target.value)} className="h-8 shadow-none border-transparent hover:border-input focus:border-input bg-transparent" />
                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-500" onClick={() => removeOption(i)}>
                                        <X className="size-3" />
                                    </Button>
                                </div>
                            ))}
                            <Button variant="ghost" size="sm" onClick={addOption} className="text-primary hover:text-primary/80 ml-6 h-8 text-xs font-normal">
                                <Plus className="mr-1 size-3" /> Add Option
                            </Button>
                        </div>
                    </FormNodeShell>
                );
            }

            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2 mt-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {node.attrs.label} {node.attrs.required && <span className="text-red-500">*</span>}
                        </label>
                        {options.map((opt, i) => (
                            <label key={`${i}-${opt}`} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded -ml-2 transition-colors">
                                <input
                                    type="radio"
                                    name={node.attrs.id}
                                    value={opt}
                                    className="size-4 border-gray-300 text-primary focus:ring-primary"
                                    onChange={(e) => context?.setAnswer(node.attrs.id, e.target.value)}
                                />
                                <span className="text-sm">{opt}</span>
                            </label>
                        ))}
                    </div>
                </NodeViewWrapper>
            );
        })
    },
});

// --- Long Text Node ---
export const LongTextNode = Node.create({
    name: 'formLongText',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'Long Text' },
            placeholder: { default: 'Long answer text' },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-long-text' }] },
    renderHTML({ HTMLAttributes }) { return ['form-long-text', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const context = useFormSubmission();
            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            if (isEditable) {
                return (
                    <FormNodeShell icon={AlignLeft} title="Long Text" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        <div className="space-y-3">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="font-medium text-sm" placeholder="Question / Label" />
                            <Textarea disabled placeholder={node.attrs.placeholder} className="bg-background shadow-sm" />
                        </div>
                    </FormNodeShell>
                );
            }

            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {node.attrs.label} {node.attrs.required && <span className="text-red-500">*</span>}
                        </label>
                        <Textarea name={node.attrs.id} placeholder={node.attrs.placeholder} required={node.attrs.required} onChange={(e) => context?.setAnswer(node.attrs.id, e.target.value)} />
                    </div>
                </NodeViewWrapper>
            )
        })
    },
});

// --- Email Node ---
export const EmailNode = Node.create({
    name: 'formEmail',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'Email' },
            placeholder: { default: 'name@example.com' },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-email' }] },
    renderHTML({ HTMLAttributes }) { return ['form-email', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const context = useFormSubmission();
            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            if (isEditable) {
                return (
                    <FormNodeShell icon={Mail} title="Email" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        <div className="space-y-3">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="font-medium text-sm" placeholder="Question / Label" />
                            <Input disabled placeholder={node.attrs.placeholder} className="bg-background shadow-sm" />
                        </div>
                    </FormNodeShell>
                );
            }
            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {node.attrs.label} {node.attrs.required && <span className="text-red-500">*</span>}
                        </label>
                        <Input type="email" name={node.attrs.id} placeholder={node.attrs.placeholder} required={node.attrs.required} onChange={(e) => context?.setAnswer(node.attrs.id, e.target.value)} />
                    </div>
                </NodeViewWrapper>
            )
        })
    },
});

// --- Date Node ---
export const DateNode = Node.create({
    name: 'formDate',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'Date' },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-date' }] },
    renderHTML({ HTMLAttributes }) { return ['form-date', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const context = useFormSubmission();
            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            if (isEditable) {
                return (
                    <FormNodeShell icon={Calendar} title="Date" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        <div className="space-y-3">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="font-medium text-sm" placeholder="Question / Label" />
                            <Input disabled type="date" className="bg-background w-full shadow-sm" />
                        </div>
                    </FormNodeShell>
                );
            }
            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {node.attrs.label} {node.attrs.required && <span className="text-red-500">*</span>}
                        </label>
                        <Input type="date" name={node.attrs.id} required={node.attrs.required} className="block w-full" onChange={(e) => context?.setAnswer(node.attrs.id, e.target.value)} />
                    </div>
                </NodeViewWrapper>
            )
        })
    },
});

// --- Checkbox Node ---
export const CheckboxNode = Node.create({
    name: 'formCheckbox',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'Checkboxes' },
            options: { default: ['Option 1'] },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-checkbox' }] },
    renderHTML({ HTMLAttributes }) { return ['form-checkbox', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const options = node.attrs.options as string[];
            const context = useFormSubmission();
            const [selected, setSelected] = useState<string[]>([]);

            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            const updateOption = (index: number, value: string) => {
                const newOptions = [...options];
                newOptions[index] = value;
                updateAttributes({ options: newOptions });
            };
            const addOption = () => updateAttributes({ options: [...options, `Option ${options.length + 1}`] });
            const removeOption = (index: number) => {
                if (options.length <= 1) return;
                updateAttributes({ options: options.filter((_, i) => i !== index) });
            };

            const handleCheckChange = (value: string, checked: boolean) => {
                let newSelected = [...selected];
                if (checked) newSelected.push(value);
                else newSelected = newSelected.filter(v => v !== value);
                setSelected(newSelected);
                context?.setAnswer(node.attrs.id, newSelected);
            };

            if (isEditable) {
                return (
                    <FormNodeShell icon={CheckSquare} title="Checkboxes" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        <div className="space-y-2">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="font-medium text-sm mb-2" placeholder="Question / Label" />
                            {options.map((opt, i) => (
                                <div key={`${i}-${opt}`} className="flex items-center gap-2">
                                    <CheckSquare className="size-4 text-muted-foreground" />
                                    <Input value={opt} onChange={(e) => updateOption(i, e.target.value)} className="h-8 shadow-none border-transparent hover:border-input focus:border-input bg-transparent" />
                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-500" onClick={() => removeOption(i)}>
                                        <X className="size-3" />
                                    </Button>
                                </div>
                            ))}
                            <Button variant="ghost" size="sm" onClick={addOption} className="text-primary hover:text-primary/80 ml-6 h-8 text-xs font-normal">
                                <Plus className="mr-1 size-3" /> Add Option
                            </Button>
                        </div>
                    </FormNodeShell>
                );
            }

            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2 mt-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {node.attrs.label} {node.attrs.required && <span className="text-red-500">*</span>}
                        </label>
                        {options.map((opt, i) => (
                            <label key={`${i}-${opt}`} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded -ml-2 transition-colors">
                                <input type="checkbox" value={opt} className="size-4 border-gray-300 text-primary rounded focus:ring-primary" onChange={(e) => handleCheckChange(opt, e.target.checked)} />
                                <span className="text-sm">{opt}</span>
                            </label>
                        ))}
                    </div>
                </NodeViewWrapper>
            );
        })
    },
});

// --- File Upload Node ---
export const FileUploadNode = Node.create({
    name: 'formFileUpload',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'Upload File' },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-file-upload' }] },
    renderHTML({ HTMLAttributes }) { return ['form-file-upload', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const context = useFormSubmission();
            const [isUploading, setIsUploading] = useState(false);
            const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0];
                if (!file) return;

                setIsUploading(true);
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const res = await fetch('/api/upload', { method: 'POST', body: formData });
                    if (!res.ok) throw new Error('Upload failed');
                    const data = await res.json();
                    setUploadedUrl(data.url);
                    context?.setAnswer(node.attrs.id, data.url);
                } catch (err) {
                    console.error(err);
                    alert('Upload failed');
                } finally {
                    setIsUploading(false);
                }
            };

            if (isEditable) {
                return (
                    <FormNodeShell icon={UploadCloud} title="File Upload" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        <div className="flex items-center gap-2">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="h-8 shadow-sm" placeholder="Label (e.g. Upload Resume)" />
                        </div>
                    </FormNodeShell>
                );
            }

            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2 mt-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{node.attrs.label} {node.attrs.required && '*'}</label>
                        {!uploadedUrl ? (
                            <div className="flex items-center gap-2">
                                <Input
                                    type="file"
                                    onChange={handleUpload}
                                    disabled={isUploading}
                                    className="cursor-pointer file:cursor-pointer"
                                />
                                {isUploading && <Loader2 className="size-4 animate-spin" />}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-green-600 border p-2 rounded bg-green-50">
                                <FileIcon className="size-4" />
                                <a href={uploadedUrl} target="_blank" rel="noopener noreferrer" className="underline truncate max-w-[200px]">View Uploaded File</a>
                                <Button variant="ghost" size="sm" className="size-6 p-0 text-muted-foreground" onClick={() => { setUploadedUrl(null); context?.setAnswer(node.attrs.id, null); }}>
                                    <X className="size-3" />
                                </Button>
                            </div>
                        )}
                    </div>
                </NodeViewWrapper>
            );
        })
    },
});

// --- Repeater Node ---
export const RepeaterNode = Node.create({
    name: 'formRepeater',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'List Items' },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-repeater' }] },
    renderHTML({ HTMLAttributes }) { return ['form-repeater', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const context = useFormSubmission();
            const [items, setItems] = useState<string[]>(['']);

            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            const handleChange = (index: number, value: string) => {
                const newItems = [...items];
                newItems[index] = value;
                setItems(newItems);
                if (!isEditable) context?.setAnswer(node.attrs.id, newItems);
            };

            const addItem = () => setItems([...items, '']);
            const removeItem = (index: number) => {
                const newItems = items.filter((_, i) => i !== index);
                setItems(newItems.length ? newItems : ['']);
                if (!isEditable) context?.setAnswer(node.attrs.id, newItems);
            };

            if (isEditable) {
                return (
                    <FormNodeShell icon={ListIcon} title="Repeater / List" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="h-8 mb-2 shadow-sm" placeholder="Field Label" />
                        <div className="space-y-2 opacity-60">
                            <div className="flex gap-2">
                                <Input disabled placeholder="Item 1" />
                                <Button disabled variant="ghost" size="icon"><Plus className="size-4" /></Button>
                            </div>
                            <div className="flex gap-2">
                                <Input disabled placeholder="Item 2" />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Users can add as many items as they need.</p>
                    </FormNodeShell>
                );
            }

            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2 mt-2">
                        <label className="text-sm font-medium leading-none">{node.attrs.label}</label>
                        {items.map((item, i) => (
                            <div key={`${i}-${item}`} className="flex gap-2">
                                <Input
                                    value={item}
                                    onChange={(e) => handleChange(i, e.target.value)}
                                    placeholder={`Item ${i + 1}`}
                                />
                                {items.length > 1 && (
                                    <Button variant="ghost" size="icon" onClick={() => removeItem(i)}>
                                        <X className="size-4" />
                                    </Button>
                                )}
                                {i === items.length - 1 && (
                                    <Button variant="outline" size="icon" onClick={addItem}>
                                        <Plus className="size-4" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </NodeViewWrapper>
            );
        })
    },
});

// --- Dropdown Node ---
export const DropdownNode = Node.create({
    name: 'formDropdown',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'Dropdown' },
            options: { default: ['Option 1'] },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-dropdown' }] },
    renderHTML({ HTMLAttributes }) { return ['form-dropdown', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const options = node.attrs.options as string[];
            const context = useFormSubmission();

            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            const updateOption = (index: number, value: string) => {
                const newOptions = [...options];
                newOptions[index] = value;
                updateAttributes({ options: newOptions });
            };
            const addOption = () => updateAttributes({ options: [...options, `Option ${options.length + 1}`] });
            const removeOption = (index: number) => {
                if (options.length <= 1) return;
                updateAttributes({ options: options.filter((_, i) => i !== index) });
            };

            if (isEditable) {
                return (
                    <FormNodeShell icon={ChevronDown} title="Dropdown" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        <div className="space-y-2">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="font-medium text-sm mb-2" placeholder="Question / Label" />
                            {options.map((opt, i) => (
                                <div key={`${i}-${opt}`} className="flex items-center gap-2">
                                    <ChevronDown className="size-4 text-muted-foreground" />
                                    <Input value={opt} onChange={(e) => updateOption(i, e.target.value)} className="h-8 shadow-none border-transparent hover:border-input focus:border-input bg-transparent" />
                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-500" onClick={() => removeOption(i)}>
                                        <X className="size-3" />
                                    </Button>
                                </div>
                            ))}
                            <Button variant="ghost" size="sm" onClick={addOption} className="text-primary hover:text-primary/80 ml-6 h-8 text-xs font-normal">
                                <Plus className="mr-1 size-3" /> Add Option
                            </Button>
                        </div>
                    </FormNodeShell>
                );
            }

            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2 mt-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {node.attrs.label} {node.attrs.required && <span className="text-red-500">*</span>}
                        </label>
                        <select
                            name={node.attrs.id}
                            required={node.attrs.required}
                            className="mt-2 w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            onChange={(e) => context?.setAnswer(node.attrs.id, e.target.value)}
                        >
                            <option value="">Select an option...</option>
                            {options.map((opt, i) => (
                                <option key={`${i}-${opt}`} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                </NodeViewWrapper>
            );
        })
    },
});

// --- Phone Node ---
export const PhoneNode = Node.create({
    name: 'formPhone',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'Phone' },
            placeholder: { default: '+1 (555) 000-0000' },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-phone' }] },
    renderHTML({ HTMLAttributes }) { return ['form-phone', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const context = useFormSubmission();
            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            if (isEditable) {
                return (
                    <FormNodeShell icon={Phone} title="Phone Number" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        <div className="space-y-3">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="font-medium text-sm" placeholder="Question / Label" />
                            <Input disabled type="tel" placeholder={node.attrs.placeholder} className="bg-background shadow-sm" />
                        </div>
                    </FormNodeShell>
                );
            }
            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {node.attrs.label} {node.attrs.required && <span className="text-red-500">*</span>}
                        </label>
                        <Input type="tel" name={node.attrs.id} placeholder={node.attrs.placeholder} required={node.attrs.required} onChange={(e) => context?.setAnswer(node.attrs.id, e.target.value)} />
                    </div>
                </NodeViewWrapper>
            )
        })
    },
});

// --- URL Node ---
export const URLNode = Node.create({
    name: 'formURL',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'URL' },
            placeholder: { default: 'https://example.com' },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-url' }] },
    renderHTML({ HTMLAttributes }) { return ['form-url', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const context = useFormSubmission();
            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            if (isEditable) {
                return (
                    <FormNodeShell icon={LinkIcon} title="URL / Link" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        <div className="space-y-3">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="font-medium text-sm" placeholder="Question / Label" />
                            <Input disabled type="url" placeholder={node.attrs.placeholder} className="bg-background shadow-sm" />
                        </div>
                    </FormNodeShell>
                );
            }
            return (
                <NodeViewWrapper className="my-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {node.attrs.label} {node.attrs.required && <span className="text-red-500">*</span>}
                        </label>
                        <Input type="url" name={node.attrs.id} placeholder={node.attrs.placeholder} required={node.attrs.required} onChange={(e) => context?.setAnswer(node.attrs.id, e.target.value)} />
                    </div>
                </NodeViewWrapper>
            )
        })
    },
});

// --- Rating Node ---
export const RatingNode = Node.create({
    name: 'formRating',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            label: { default: 'Rating' },
            maxRating: { default: 5 },
            required: { default: false },
            conditions: { default: [] },
        }
    },
    parseHTML() { return [{ tag: 'form-rating' }] },
    renderHTML({ HTMLAttributes }) { return ['form-rating', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const context = useFormSubmission();
            const [rating, setRating] = useState(0);
            const [hover, setHover] = useState(0);

            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            if (isEditable) {
                return (
                    <FormNodeShell icon={Star} title="Rating" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        <div className="space-y-3">
                            <Input value={node.attrs.label} onChange={(e) => updateAttributes({ label: e.target.value })} className="font-medium text-sm" placeholder="Question / Label" />
                            <div className="flex gap-1 opacity-60">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i + 1} className="size-6 text-yellow-400 fill-yellow-400" />
                                ))}
                            </div>
                        </div>
                    </FormNodeShell>
                );
            }

            return (
                <NodeViewWrapper className="my-4">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {node.attrs.label} {node.attrs.required && <span className="text-red-500">*</span>}
                    </label>
                    <div className="flex gap-1 mt-2">
                        {[...Array(node.attrs.maxRating)].map((_, i) => {
                            const ratingValue = i + 1;
                            return (
                                <button
                                    key={ratingValue}
                                    type="button"
                                    onClick={() => {
                                        setRating(ratingValue);
                                        context?.setAnswer(node.attrs.id, ratingValue);
                                    }}
                                    onMouseEnter={() => setHover(ratingValue)}
                                    onMouseLeave={() => setHover(0)}
                                    className="transition-transform hover:scale-110"
                                >
                                    <Star
                                        className={`size-8 transition-colors ${ratingValue <= (hover || rating)
                                            ? 'text-yellow-400 fill-yellow-400'
                                            : 'text-gray-300'
                                            }`}
                                    />
                                </button>
                            );
                        })}
                    </div>
                </NodeViewWrapper>
            );
        })
    },
});

// --- Divider Node ---
export const DividerNode = Node.create({
    name: 'formDivider',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
        }
    },
    parseHTML() { return [{ tag: 'form-divider' }] },
    renderHTML({ HTMLAttributes }) { return ['form-divider', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;

            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            if (isEditable) {
                return (
                    <NodeViewWrapper className="group relative my-4 pl-10 pr-2">
                        <div className="absolute left-0 top-3 flex flex-col justify-start gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                            <div
                                draggable="true"
                                data-drag-handle
                                className="cursor-grab p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
                            >
                                <GripVertical className="size-4" />
                            </div>
                            <button
                                type="button"
                                onClick={deleteNode}
                                className="cursor-pointer p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-colors"
                                title="Delete Section"
                            >
                                <Trash2 className="size-4" />
                            </button>
                        </div>
                        <div className="border-t-2 border-muted-foreground/20 my-4"></div>
                    </NodeViewWrapper>
                );
            }

            return (
                <NodeViewWrapper className="my-6">
                    <hr className="border-t-2 border-muted-foreground/20" />
                </NodeViewWrapper>
            );
        })
    },
});

// --- Image Node ---
export const ImageNode = Node.create({
    name: 'formImage',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => (!attributes.id ? {} : { 'data-id': attributes.id }),
            },
            src: { default: '' },
            alt: { default: '' },
            caption: { default: '' },
        }
    },
    parseHTML() { return [{ tag: 'form-image' }] },
    renderHTML({ HTMLAttributes }) { return ['form-image', mergeAttributes(HTMLAttributes)] },
    addNodeView() {
        return ReactNodeViewRenderer(({ node, updateAttributes, deleteNode, editor }) => {
            const isEditable = editor.isEditable;
            const [isUploading, setIsUploading] = useState(false);

            useDeferredNodeId(node.attrs.id, isEditable, updateAttributes);

            const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0];
                if (!file) return;

                setIsUploading(true);
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const res = await fetch('/api/upload', { method: 'POST', body: formData });
                    if (!res.ok) throw new Error('Upload failed');
                    const data = await res.json();
                    updateAttributes({ src: data.url, alt: file.name });
                } catch (err) {
                    console.error(err);
                    alert('Upload failed');
                } finally {
                    setIsUploading(false);
                }
            };

            if (isEditable) {
                return (
                    <FormNodeShell icon={ImageIcon} title="Image" node={node} updateAttributes={updateAttributes} deleteNode={deleteNode}>
                        {!node.attrs.src ? (
                            <div className="flex items-center gap-2">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleUpload}
                                    disabled={isUploading}
                                    className="cursor-pointer file:cursor-pointer"
                                />
                                {isUploading && <Loader2 className="size-4 animate-spin" />}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={node.attrs.src} alt={node.attrs.alt} className="max-w-full h-auto rounded-md" />
                                <Input
                                    value={node.attrs.caption}
                                    onChange={(e) => updateAttributes({ caption: e.target.value })}
                                    placeholder="Add a caption (optional)"
                                    className="h-8 text-sm"
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateAttributes({ src: '', alt: '', caption: '' })}
                                >
                                    Change Image
                                </Button>
                            </div>
                        )}
                    </FormNodeShell>
                );
            }

            return (
                <NodeViewWrapper className="my-4">
                    {node.attrs.src && (
                        <div className="space-y-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={node.attrs.src} alt={node.attrs.alt} className="max-w-full h-auto rounded-md" />
                            {node.attrs.caption && (
                                <p className="text-sm text-muted-foreground text-center">{node.attrs.caption}</p>
                            )}
                        </div>
                    )}
                </NodeViewWrapper>
            );
        })
    },
});

export const FormExtensions = [
    ShortTextNode,
    MultipleChoiceNode,
    LongTextNode,
    EmailNode,
    DateNode,
    CheckboxNode,
    FileUploadNode,
    RepeaterNode,
    DropdownNode,
    PhoneNode,
    URLNode,
    RatingNode,
    DividerNode,
    ImageNode
];
