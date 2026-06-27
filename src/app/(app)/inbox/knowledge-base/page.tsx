'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  FileText,
  Globe,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { useToast } from '@/hooks/use-toast';
import {
  Button,
  Card,
  Chip,
  Field,
  FormDialog,
  IconButton,
  Input,
  KpiRow,
  SearchInput,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui-kit';
import { Input as ShadcnInput } from '@/components/ui/input';
import {
  buildKnowledgeBaseFileEntry,
  getKnowledgeBaseFileConfig,
} from '@/lib/brand-memory/knowledge-base-upload';

interface KnowledgeEntry {
  _id: string;
  name: string;
  content: string;
  type: 'document' | 'url' | 'text' | 'faq' | 'pdf';
  sourceModule: string;
  metadata?: {
    url?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    tags?: string[];
    sourceSurface?: string;
  };
  createdAt: string;
  updatedAt?: string;
}

type UploadType = 'document' | 'url' | 'text';

type EditorState = {
  mode: 'create' | 'edit';
  id?: string;
  name: string;
  uploadType: UploadType;
  content: string;
  tags: string;
  url: string;
  existingType?: KnowledgeEntry['type'];
  existingMetadata?: KnowledgeEntry['metadata'];
};

const EMPTY_EDITOR: EditorState = {
  mode: 'create',
  name: '',
  uploadType: 'document',
  content: '',
  tags: '',
  url: '',
};

function KnowledgeEntryCard({
  entry,
  isDeleting,
  onEdit,
  onDelete,
}: {
  entry: KnowledgeEntry;
  isDeleting: boolean;
  onEdit: (entry: KnowledgeEntry) => void;
  onDelete: (entry: KnowledgeEntry) => void;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{entry.name}</h3>
              <Chip tone="brand">{entry.type}</Chip>
              {entry.metadata?.fileName ? <Chip tone="gray">{entry.metadata.fileName}</Chip> : null}
            </div>
            <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">{entry.content}</p>
            {entry.metadata?.tags?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {entry.metadata.tags.map((tag) => (
                  <Chip key={tag} tone="gray">
                    {tag}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <IconButton icon={Pencil} iconSize={16} onClick={() => onEdit(entry)} aria-label="Edit" />
            {isDeleting ? (
              <span className="grid size-8 place-items-center">
                <Spinner size={16} />
              </span>
            ) : (
              <IconButton icon={Trash2} iconSize={16} onClick={() => void onDelete(entry)} aria-label="Delete" />
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Updated {new Date(entry.updatedAt || entry.createdAt).toLocaleDateString()}
        </div>
      </div>
    </Card>
  );
}

export default function KnowledgeBasePage() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '50', sourceModule: 'manual' });
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/v2/brand-memory?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load knowledge base');
      }

      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Failed to load knowledge base.',
      });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, toast]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  const stats = useMemo(() => {
    const urls = entries.filter((entry) => entry.type === 'url').length;
    const docs = entries.filter((entry) => entry.type === 'document' || entry.type === 'pdf').length;
    const texts = entries.filter((entry) => entry.type === 'text').length;

    return [
      {
        label: 'Manual knowledge',
        value: entries.length,
        icon: BookOpen,
        pastel: 'violet' as const,
      },
      {
        label: 'Documents',
        value: docs,
        icon: FileText,
        pastel: 'blue' as const,
      },
      {
        label: 'URLs',
        value: urls,
        icon: Globe,
        pastel: 'mint' as const,
      },
      {
        label: 'Text notes',
        value: texts,
        icon: Plus,
        pastel: 'peach' as const,
      },
    ];
  }, [entries]);

  function openCreateEditor() {
    setEditor(EMPTY_EDITOR);
    setEditorFile(null);
  }

  function openEditEditor(entry: KnowledgeEntry) {
    setEditor({
      mode: 'edit',
      id: entry._id,
      name: entry.name,
      uploadType: entry.type === 'url' ? 'url' : entry.type === 'text' ? 'text' : 'document',
      content: entry.content,
      tags: entry.metadata?.tags?.join(', ') || '',
      url: entry.metadata?.url || '',
      existingType: entry.type,
      existingMetadata: entry.metadata,
    });
    setEditorFile(null);
  }

  async function handleSave() {
    if (!editor) {
      return;
    }

    const trimmedName = editor.name.trim();
    const trimmedTags = editor.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      setSaving(true);

      let name = trimmedName;
      let type: KnowledgeEntry['type'] = editor.existingType || editor.uploadType;
      let content = editor.content.trim();
      let metadata: KnowledgeEntry['metadata'] = {
        ...(editor.existingMetadata || {}),
        tags: trimmedTags,
        sourceSurface: 'crm-inbox-knowledge-base',
      };

      if (editor.uploadType === 'document') {
        if (!editorFile && editor.mode === 'create') {
          throw new Error('Please choose a document to upload.');
        }

        if (editorFile) {
          const fileConfig = getKnowledgeBaseFileConfig({
            name: editorFile.name,
            type: editorFile.type,
            size: editorFile.size,
          });
          const extractedText = content || (fileConfig.canExtractTextInBrowser ? (await editorFile.text()).trim() : '');
          const fileEntry = buildKnowledgeBaseFileEntry({
            file: {
              name: editorFile.name,
              type: editorFile.type,
              size: editorFile.size,
            },
            extractedText,
          });

          type = fileEntry.type;
          content = fileEntry.content;
          metadata = {
            ...metadata,
            ...fileEntry.metadata,
          };
          if (!name) {
            name = editorFile.name;
          }
        }
      }

      if (editor.uploadType === 'url') {
        const trimmedUrl = editor.url.trim();
        if (!trimmedUrl) {
          throw new Error('Please provide a URL.');
        }

        type = 'url';
        metadata = {
          ...metadata,
          url: trimmedUrl,
        };
        if (!content) {
          content = `Source URL: ${trimmedUrl}`;
        }
      }

      if (editor.uploadType === 'text') {
        type = 'text';
      }

      if (!name || !content) {
        throw new Error('Name and content are required.');
      }

      const response = await fetch('/api/v2/brand-memory', {
        method: editor.mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editor.id,
          name,
          content,
          type,
          metadata,
        }),
      });

      if (!response.ok) {
        throw new Error(editor.mode === 'create' ? 'Failed to create knowledge entry.' : 'Failed to update knowledge entry.');
      }

      toast({
        title: editor.mode === 'create' ? 'Knowledge added' : 'Knowledge updated',
        description: editor.mode === 'create'
          ? 'The brand knowledge entry is now available to conversations and AI-assisted replies.'
          : 'The knowledge entry has been updated.',
      });
      setEditor(null);
      setEditorFile(null);
      await fetchEntries();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: editor.mode === 'create' ? 'Create failed' : 'Update failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: KnowledgeEntry) {
    if (!confirm(`Delete "${entry.name}" from the knowledge base?`)) {
      return;
    }

    try {
      setDeletingId(entry._id);
      const response = await fetch('/api/v2/brand-memory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: [entry._id] }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete knowledge entry.');
      }

      toast({
        title: 'Knowledge removed',
        description: 'The entry has been removed from the manual knowledge base.',
      });
      await fetchEntries();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setDeletingId(null);
    }
  }

  const addButton = (
    <Button size="sm" variant="primary" icon={Plus} onClick={() => openCreateEditor()}>
      Add knowledge
    </Button>
  );

  const searchBar = (
    <SearchInput
      value={searchQuery}
      onChange={(event) => setSearchQuery(event.target.value)}
      placeholder="Search your brand knowledge"
      wrapClassName="w-full max-w-sm"
    />
  );

  return (
    <ModuleShell
      title="Knowledge base"
      icon={BookOpen}
      primaryAction={addButton}
      filterBar={searchBar}
      isLoading={loading}
      isEmpty={!loading && entries.length === 0}
      emptyState={{
        icon: BookOpen,
        title: 'No manual knowledge entries yet',
        description:
          'Add your own brand guidelines, policies, product details, PDFs, Word docs, URLs, or text notes. This view only shows the entries your team intentionally manages.',
        action: (
          <Button variant="primary" icon={Plus} onClick={() => openCreateEditor()}>
            Add your first entry
          </Button>
        ),
      }}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <KpiRow cols={4} items={stats} />

      <Card title="Manual brand knowledge" meta="User-authored entries only">
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          This page is reserved for user-authored brand knowledge. Auto-generated inbox or AI memory entries are not shown here.
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {entries.map((entry) => (
          <KnowledgeEntryCard
            key={entry._id}
            entry={entry}
            isDeleting={deletingId === entry._id}
            onEdit={openEditEditor}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <FormDialog
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null);
            setEditorFile(null);
          }
        }}
        title={editor?.mode === 'edit' ? 'Edit knowledge entry' : 'Add knowledge entry'}
        icon={BookOpen}
        size="lg"
        submitLabel={editor?.mode === 'edit' ? 'Save changes' : 'Create entry'}
        submitting={saving}
        onSubmit={() => {
          void handleSave();
        }}
      >
        {editor ? (
          <>
            <Field label="Entry type" htmlFor="knowledge-type">
              <Select
                value={editor.uploadType}
                onChange={(value) =>
                  setEditor((current) => (current ? { ...current, uploadType: value as UploadType } : current))
                }
                aria-label="Entry type"
                options={[
                  { value: 'document', label: 'Document' },
                  { value: 'url', label: 'URL' },
                  { value: 'text', label: 'Text' },
                ]}
              />
            </Field>

            <Field label="Name" htmlFor="knowledge-name">
              <Input
                id="knowledge-name"
                value={editor.name}
                onChange={(event) =>
                  setEditor((current) => (current ? { ...current, name: event.target.value } : current))
                }
                placeholder="Brand voice guide"
              />
            </Field>

            {editor.uploadType === 'document' ? (
              <Field
                label="File"
                htmlFor="knowledge-file"
                hint="Text files can be read directly. PDF and Word files are added as editable knowledge entries with file metadata so you can refine the summary after upload."
              >
                <ShadcnInput
                  id="knowledge-file"
                  type="file"
                  accept=".txt,.md,.csv,.json,.html,.htm,.pdf,.doc,.docx"
                  onChange={(event) => setEditorFile(event.target.files?.[0] || null)}
                />
              </Field>
            ) : null}

            {editor.uploadType === 'url' ? (
              <Field label="URL" htmlFor="knowledge-url">
                <Input
                  id="knowledge-url"
                  type="url"
                  value={editor.url}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, url: event.target.value } : current))
                  }
                  placeholder="https://example.com/brand-guide"
                />
              </Field>
            ) : null}

            <Field label="Content" htmlFor="knowledge-content">
              <Textarea
                id="knowledge-content"
                value={editor.content}
                onChange={(event) =>
                  setEditor((current) => (current ? { ...current, content: event.target.value } : current))
                }
                rows={10}
                placeholder={
                  editor.uploadType === 'document'
                    ? 'Optional: paste a clean summary or extracted text. Leave blank to use the file fallback entry for PDF/Word docs.'
                    : editor.uploadType === 'url'
                      ? 'Optional: add a summary or notes for this URL.'
                      : 'Paste the brand knowledge content here...'
                }
              />
            </Field>

            <Field label="Tags" htmlFor="knowledge-tags">
              <Input
                id="knowledge-tags"
                value={editor.tags}
                onChange={(event) =>
                  setEditor((current) => (current ? { ...current, tags: event.target.value } : current))
                }
                placeholder="brand, tone, faq"
              />
            </Field>
          </>
        ) : null}
      </FormDialog>
    </ModuleShell>
  );
}
