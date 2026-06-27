'use client';

import { useEffect, useReducer, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

import {
    Button,
    Card,
    Tabs,
    Field,
    Input,
    Textarea,
    Select,
    Spinner,
} from '@/components/ui-kit';
import { Label } from '@/components/ui/label';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface DocFormState {
    title: string;
    description: string;
    icon: string;
    isActive: boolean;
    sortOrder: number;
    settings: { coverImage: string };
}

const initialDocForm: DocFormState = {
    title: '',
    description: '',
    icon: 'FileText',
    isActive: true,
    sortOrder: 0,
    settings: { coverImage: '' },
};

type DocFormAction =
    | { type: 'setTitle'; value: string }
    | { type: 'setDescription'; value: string }
    | { type: 'setIcon'; value: string }
    | { type: 'setIsActive'; value: boolean }
    | { type: 'setSortOrder'; value: number }
    | { type: 'setSettings'; value: { coverImage: string } }
    | { type: 'hydrate'; value: Partial<DocFormState> };

function docFormReducer(state: DocFormState, action: DocFormAction): DocFormState {
    switch (action.type) {
        case 'setTitle':
            return { ...state, title: action.value };
        case 'setDescription':
            return { ...state, description: action.value };
        case 'setIcon':
            return { ...state, icon: action.value };
        case 'setIsActive':
            return { ...state, isActive: action.value };
        case 'setSortOrder':
            return { ...state, sortOrder: action.value };
        case 'setSettings':
            return { ...state, settings: action.value };
        case 'hydrate':
            return { ...state, ...action.value };
        default:
            return state;
    }
}

export default function DocTemplateEditor(props: { params: Promise<{ id: string }> }) {
    const params = use(props.params);
    const isNew = params.id === 'new';
    const router = useRouter();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    // Form State
    const [form, dispatchForm] = useReducer(docFormReducer, initialDocForm);
    const { title, description, icon, isActive, sortOrder, settings } = form;
    const [activeTab, setActiveTab] = useState('general');

    // Editor setup
    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({ placeholder: 'Design your document template here...' }),
        ],
        content: '',
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[300px] border rounded-md p-4',
            },
        },
    });

    // Fetch existing data
    const { data, isLoading } = useSWR(
        !isNew ? `/api/admin/templates/docs/${params.id}` : null,
        fetcher
    );

    useEffect(() => {
        if (data && data.template) {
            const t = data.template;
            dispatchForm({
                type: 'hydrate',
                value: {
                    title: t.title,
                    description: t.description,
                    icon: t.icon,
                    isActive: t.isActive,
                    sortOrder: t.sortOrder || 0,
                    settings: t.settings || {},
                },
            });

            if (editor && t.content) {
                try {
                    const content = JSON.parse(t.content);
                    editor.commands.setContent(content);
                } catch (e) {
                    console.error('Failed to parse content JSON', e);
                }
            }
        }
    }, [data, editor]);

    const handleSave = async () => {
        if (!title || !description || !editor) {
            toast({ variant: 'destructive', title: 'Missing fields', description: 'Please fill in title and description.' });
            return;
        }

        setIsSaving(true);
        try {
            const content = JSON.stringify(editor.getJSON());
            const payload = {
                title,
                description,
                icon,
                content,
                settings,
                isActive,
                sortOrder,
            };

            const url = isNew ? '/api/admin/templates/docs' : `/api/admin/templates/docs/${params.id}`;
            const method = isNew ? 'POST' : 'PATCH';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error('Failed to save template');

            toast({ title: isNew ? 'Template created' : 'Template updated' });
            router.push('/admin/templates');
            router.refresh();
        } catch (_error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not save template.' });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Spinner size={32} />
            </div>
        );
    }

    return (
        <div className="container max-w-4xl py-8">
            <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" size="sm" icon={ArrowLeft} asChild>
                    <Link href="/admin/templates" />
                </Button>
                <h1 className="text-2xl font-bold flex-1">{isNew ? 'Create Doc Template' : 'Edit Doc Template'}</h1>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Switch id="active-mode" checked={isActive} onCheckedChange={(v) => dispatchForm({ type: 'setIsActive', value: v })} />
                        <Label htmlFor="active-mode">Active</Label>
                    </div>
                    <Button variant="primary" icon={Save} onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Spinner size={14} /> : null}
                        Save Template
                    </Button>
                </div>
            </div>

            <Tabs
                value={activeTab}
                onChange={setActiveTab}
                className="mb-6"
                tabs={[
                    { value: 'general', label: 'General Info' },
                    { value: 'content', label: 'Content' },
                    { value: 'settings', label: 'Settings' },
                ]}
            />

            {activeTab === 'general' && (
                <Card title="Template Details" meta="Basic information about this document template.">
                    <div className="p-5 space-y-4">
                        <Field label="Template Title" htmlFor="title">
                            <Input id="title" value={title} onChange={(e) => dispatchForm({ type: 'setTitle', value: e.target.value })} placeholder="e.g. Project Proposal" />
                        </Field>

                        <Field label="Description" htmlFor="description">
                            <Textarea id="description" value={description} onChange={(e) => dispatchForm({ type: 'setDescription', value: e.target.value })} placeholder="Short description..." />
                        </Field>

                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Icon">
                                <Select
                                    value={icon}
                                    onChange={(v) => dispatchForm({ type: 'setIcon', value: v })}
                                    options={[
                                        { value: 'FileText', label: 'FileText' },
                                        { value: 'PenSquare', label: 'PenSquare' },
                                        { value: 'Compass', label: 'Compass' },
                                        { value: 'Mail', label: 'Mail' },
                                    ]}
                                />
                            </Field>
                            <Field label="Sort Order" htmlFor="sort">
                                <Input id="sort" type="number" value={sortOrder} onChange={(e) => dispatchForm({ type: 'setSortOrder', value: parseInt(e.target.value) || 0 })} />
                            </Field>
                        </div>
                    </div>
                </Card>
            )}

            {activeTab === 'content' && (
                <Card title="Document Builder" meta="Design the initial content structure.">
                    <div className="p-5 space-y-4">
                        {/* TipTap editor internals — preserved exactly */}
                        <div className="border rounded-md min-h-[400px]">
                            {editor && <EditorContent editor={editor} />}
                        </div>
                        <Field label="Raw JSON Content (Advanced)">
                            <Textarea
                                className="font-mono text-xs h-32 resize-none"
                                value={editor ? JSON.stringify(editor.getJSON()) : ''}
                                onChange={(e) => {
                                    try {
                                        const json = JSON.parse(e.target.value);
                                        editor?.commands.setContent(json);
                                    } catch (_e) { }
                                }}
                            />
                        </Field>
                    </div>
                </Card>
            )}

            {activeTab === 'settings' && (
                <Card title="Additional Settings">
                    <div className="p-5 space-y-4">
                        <Field label="Default Cover Image URL" htmlFor="cover">
                            <Input
                                id="cover"
                                value={settings.coverImage || ''}
                                onChange={(e) => dispatchForm({ type: 'setSettings', value: { ...settings, coverImage: e.target.value } })}
                                placeholder="https://..."
                            />
                        </Field>
                    </div>
                </Card>
            )}
        </div>
    );
}
