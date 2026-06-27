'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Sparkles, Copy, Trash2, Edit, FileText, Clock3 } from 'lucide-react';

import {
  Button,
  Card,
  Chip,
  SearchInput,
  KpiRow,
  DataTable,
  ActionMenu,
  ConfirmDialog,
  FormDialog,
  Field,
  Textarea,
  type DataTableColumn,
} from '@/components/ui-kit';
import { ModuleShell } from '@/components/shell/module-shell';

type EmailTemplate = {
  _id: string;
  name: string;
  subject?: string;
  createdAt: string;
  isAiGenerated?: boolean;
};

type TemplatesResponse = {
  data?: EmailTemplate[];
};

export default function TemplatesPage() {
  const [search, setSearch] = useState('');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const router = useRouter();

  const { data, isLoading, refetch, error } = useQuery<TemplatesResponse>({
    queryKey: ['marketing-templates'],
    queryFn: async () => {
      const response = await fetch('/api/v2/marketing-email/templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  const templates = useMemo(() => data?.data || [], [data]);
  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templates;

    return templates.filter((template) => {
      const name = template.name?.toLowerCase() || '';
      const subject = template.subject?.toLowerCase() || '';
      return name.includes(query) || subject.includes(query);
    });
  }, [search, templates]);

  const summary = useMemo(() => {
    const aiGenerated = templates.filter((template) => template.isAiGenerated).length;
    const manual = templates.length - aiGenerated;
    const latest = templates.length
      ? [...templates].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]
      : null;

    return {
      total: templates.length,
      aiGenerated,
      manual,
      latest,
    };
  }, [templates]);

  const handleGenerateValues = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    try {
      const response = await fetch('/api/v2/marketing-email/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      if (!response.ok) throw new Error('Generation failed');

      const result = await response.json();

      const createResponse = await fetch('/api/v2/marketing-email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `AI Generated: ${aiPrompt.substring(0, 20)}...`,
          subject: result.subject,
          htmlContent: result.html,
          textContent: result.text || 'View HTML version',
          isAiGenerated: true,
          aiPrompt,
        }),
      });

      if (!createResponse.ok) throw new Error('Failed to save generated template');

      toast.success('Template generated successfully!');
      setIsAiModalOpen(false);
      setAiPrompt('');
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/v2/marketing-email/templates/${id}`, { method: 'DELETE' });
      toast.success('Template deleted');
      refetch();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/v2/marketing-email/templates/${id}`);
      if (!res.ok) throw new Error('Failed to fetch template');
      const original = await res.json();

      const createRes = await fetch('/api/v2/marketing-email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Copy of ${original.name}`,
          subject: original.subject,
          htmlContent: original.htmlContent,
          textContent: original.textContent,
          isAiGenerated: false,
        }),
      });
      if (!createRes.ok) throw new Error('Failed to duplicate template');

      toast.success('Template duplicated');
      refetch();
    } catch {
      toast.error('Failed to duplicate template');
    }
  };

  const columns = useMemo<DataTableColumn<EmailTemplate>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.isAiGenerated ? <Sparkles className="size-3.5 text-brand-strong" /> : null}
            <Link
              href={`/campaigns/templates/${row.original._id}`}
              className="font-semibold text-[13.5px] hover:underline"
            >
              {row.original.name}
            </Link>
          </div>
        ),
      },
      {
        accessorKey: 'subject',
        header: 'Subject',
        cell: ({ row }) => (
          <span className="block max-w-[320px] truncate text-muted-foreground">
            {row.original.subject || 'No subject'}
          </span>
        ),
      },
      {
        id: 'source',
        header: 'Source',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.isAiGenerated ? (
            <Chip tone="brand" icon={Sparkles}>
              AI
            </Chip>
          ) : (
            <Chip tone="gray">Manual</Chip>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <ActionMenu
            items={[
              {
                label: 'Edit',
                icon: Edit,
                onSelect: () => router.push(`/campaigns/templates/${row.original._id}`),
              },
              { label: 'Duplicate', icon: Copy, onSelect: () => void handleDuplicate(row.original._id) },
              {
                label: 'Delete',
                icon: Trash2,
                danger: true,
                separatorBefore: true,
                onSelect: () => setConfirmId(row.original._id),
              },
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );

  const primaryAction = (
    <div className="flex items-center gap-2">
      <Button variant="outline" icon={Sparkles} onClick={() => setIsAiModalOpen(true)}>
        AI Generate
      </Button>
      <Button variant="brand" icon={Plus} onClick={() => router.push('/campaigns/templates/new')}>
        New template
      </Button>
    </div>
  );

  return (
    <ModuleShell
      title="Templates"
      icon={FileText}
      primaryAction={primaryAction}
      filterBar={
        <SearchInput
          placeholder="Search templates…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          wrapClassName="max-w-md"
        />
      }
      isLoading={isLoading}
      error={error ? { message: 'Failed to load email templates.' } : null}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <KpiRow
        items={[
          { icon: FileText, label: 'Templates', value: summary.total, pastel: 'violet' },
          { icon: Sparkles, label: 'AI generated', value: summary.aiGenerated, pastel: 'blue' },
          { icon: Edit, label: 'Manual', value: summary.manual, pastel: 'mint' },
          {
            icon: Clock3,
            label: 'Latest',
            value: summary.latest ? new Date(summary.latest.createdAt).toLocaleDateString() : 'None',
            pastel: 'peach',
          },
        ]}
      />

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          data={filteredTemplates}
          getRowId={(row) => row._id}
          emptyTitle={templates.length === 0 ? 'No templates found' : 'No matching templates'}
          emptyNote={
            templates.length === 0
              ? 'Create a template or generate one with AI to start building your email library.'
              : 'Adjust the search term to see more of the existing template library.'
          }
        />
      </Card>

      <FormDialog
        open={isAiModalOpen}
        onOpenChange={setIsAiModalOpen}
        title="Generate template with AI"
        icon={Sparkles}
        description="Describe the email you want to send and the AI will generate the subject line and HTML content."
        submitLabel={isGenerating ? 'Generating…' : 'Generate'}
        submitting={isGenerating}
        submitDisabled={!aiPrompt}
        onSubmit={handleGenerateValues}
      >
        <Field label="Prompt" htmlFor="ai-prompt">
          <Textarea
            id="ai-prompt"
            placeholder="e.g. A promotional email for our summer sale with a 20% discount code SUMMER20…"
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            rows={6}
          />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title="Delete template?"
        description="This permanently removes the template from your library. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (confirmId) await handleDelete(confirmId);
        }}
      />
    </ModuleShell>
  );
}
