'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Trash2,
  Link as LinkIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  Card,
  Chip,
  Button,
  Segmented,
  Skeleton,
  EmptyState,
  ChatBubble,
  ConfirmDialog,
  type ChipTone,
} from '@/components/ui-kit';

interface TemplateComponent {
  type: string;
  text?: string;
  format?: string;
  [key: string]: unknown;
}

interface Template {
  _id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: TemplateComponent[];
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

interface TemplateListManagerProps {
  accountId: string;
}

const STATUS_META: Record<string, { label: string; tone: ChipTone; icon: typeof CheckCircle }> = {
  APPROVED: { label: 'Approved', tone: 'ok', icon: CheckCircle },
  PENDING: { label: 'Pending', tone: 'warn', icon: Clock },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: XCircle },
  DRAFT: { label: 'Draft', tone: 'gray', icon: FileText },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.DRAFT;
}

function TemplatePreviewContent({ template }: { template: Template }) {
  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Status:</span>
        <Chip tone={statusMeta(template.status).tone} icon={statusMeta(template.status).icon}>
          {statusMeta(template.status).label}
        </Chip>
      </div>

      {/* Preview */}
      <div className="max-w-sm rounded-lg bg-muted p-4">
        {template.components.map((component) => (
          <div key={component.type} className="mb-2">
            {component.type === 'HEADER' && (
              <div>
                {component.format === 'TEXT' && (
                  <div className="mb-2 font-bold">{component.text}</div>
                )}
                {(component.format === 'IMAGE' ||
                  component.format === 'VIDEO' ||
                  component.format === 'DOCUMENT') && (
                  <div className="mb-2 grid place-items-center rounded bg-muted-foreground/10 p-6 text-center">
                    <FileText className="size-10 text-muted-foreground" />
                    <p className="mt-2 text-xs text-muted-foreground capitalize">
                      {component.format.toLowerCase()} header
                    </p>
                  </div>
                )}
              </div>
            )}

            {component.type === 'BODY' && (
              <div className="whitespace-pre-wrap text-[13.5px]">{component.text}</div>
            )}

            {component.type === 'FOOTER' && (
              <div className="mt-2 text-xs text-muted-foreground">{component.text}</div>
            )}

            {component.type === 'BUTTONS' && (
              <div className="mt-3 space-y-2">
                {(component.buttons as { text: string }[] | undefined)?.map((btn) => (
                  <div
                    key={btn.text}
                    className="rounded border border-border bg-card p-2 text-center text-sm text-info"
                  >
                    {btn.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Metadata */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Created:</span>
          <span>{new Date(template.createdAt).toLocaleString()}</span>
        </div>
        {template.submittedAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Submitted:</span>
            <span>{new Date(template.submittedAt).toLocaleString()}</span>
          </div>
        )}
        {template.approvedAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Approved:</span>
            <span>{new Date(template.approvedAt).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function TemplateListManager({ accountId }: TemplateListManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  // Fetch templates
  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/whatsapp/templates?accountId=${accountId}`);
      const data = await response.json();

      if (response.ok) {
        setTemplates(data.data || []);
      } else {
        toast.error('Failed to fetch templates');
      }
    } catch (error) {
      toast.error('Error fetching templates');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Submit template for approval
  const handleSubmit = async (templateId: string) => {
    setSubmitting(templateId);
    try {
      const response = await fetch(`/api/whatsapp/templates/${templateId}/submit`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Template submitted for approval');
        fetchTemplates();
      } else {
        toast.error(data.error || 'Failed to submit template');
      }
    } catch (error) {
      toast.error('Error submitting template');
      console.error(error);
    } finally {
      setSubmitting(null);
    }
  };

  // Delete template
  const handleDelete = async (templateId: string) => {
    try {
      const response = await fetch(`/api/whatsapp/templates/${templateId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Template deleted');
        fetchTemplates();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete template');
      }
    } catch (error) {
      toast.error('Error deleting template');
      console.error(error);
    }
  };

  // Open preview
  const openPreview = (template: Template) => {
    setSelectedTemplate(template);
    setIsPreviewOpen(true);
  };

  // Component helpers
  const getHeader = (components: TemplateComponent[]) => {
    const head = components.find((c) => c.type === 'HEADER' && c.format === 'TEXT');
    return head?.text || null;
  };
  const getBody = (components: TemplateComponent[]) => {
    const body = components.find((c) => c.type === 'BODY');
    return body?.text || 'No content';
  };
  const getButtons = (components: TemplateComponent[]): string[] => {
    const btns = components.find((c) => c.type === 'BUTTONS');
    const list = (btns?.buttons as { text: string }[] | undefined) ?? [];
    return list.map((b) => b.text).filter(Boolean);
  };

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const list =
    filter === 'All'
      ? templates
      : templates.filter((t) => statusMeta(t.status).label === filter);

  return (
    <div className="flex flex-col gap-3">
      {/* Filter */}
      <Segmented
        options={['All', 'Approved', 'Pending', 'Rejected']}
        value={filter}
        onChange={setFilter}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-lg" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No templates yet"
            note="Create your first template to start sending messages outside the 24-hour window."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((template) => {
            const meta = statusMeta(template.status);
            const head = getHeader(template.components);
            const body = getBody(template.components);
            const buttons = getButtons(template.components);
            return (
              <Card key={template._id} lift className="flex flex-col">
                {/* WhatsApp preview */}
                <div
                  className="flex flex-col gap-2 border-b border-border bg-[#e7ddd3] p-4 dark:bg-[#0b141a]"
                  style={{
                    backgroundImage:
                      'radial-gradient(rgba(120,120,90,0.12) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                  }}
                >
                  <ChatBubble dir="out" variant="whatsapp" time="12:04 ✓✓" className="max-w-full">
                    {head ? <div className="mb-1 font-bold">{head}</div> : null}
                    <div className="line-clamp-4">{body}</div>
                    {buttons.length > 0 ? (
                      <div className="-mx-3 -mb-2 mt-2 flex flex-col gap-px">
                        {buttons.map((b) => (
                          <div
                            key={b}
                            className="flex items-center justify-center gap-1.5 border-t border-[#e9edef] py-2 text-center text-[12.5px] font-medium text-[#00a5f4] dark:border-white/10 dark:text-[#53bdeb]"
                          >
                            <LinkIcon className="size-3" />
                            {b}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </ChatBubble>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2.5 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[13px] font-semibold">{template.name}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {template.category} · {template.language.toUpperCase()}
                    </div>
                  </div>
                  <Chip tone={meta.tone} icon={meta.icon}>{meta.label}</Chip>
                </div>

                {template.status === 'REJECTED' && template.rejectionReason ? (
                  <div className="mx-4 mb-3 rounded-md border border-danger/25 bg-danger-muted px-2.5 py-1.5 text-[11.5px] text-danger-foreground">
                    <strong>Rejected:</strong> {template.rejectionReason}
                  </div>
                ) : null}

                {/* Actions */}
                <div className="mt-auto flex items-center gap-2 px-4 pb-4">
                  <Button variant="outline" size="sm" icon={Eye} onClick={() => openPreview(template)} className="flex-1">
                    Preview
                  </Button>
                  {template.status === 'DRAFT' ? (
                    <Button
                      size="sm"
                      icon={Send}
                      onClick={() => handleSubmit(template._id)}
                      disabled={submitting === template._id}
                      className="flex-1"
                    >
                      {submitting === template._id ? 'Submitting…' : 'Submit'}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    aria-label="Delete template"
                    onClick={() => setDeleteTarget(template)}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete template?"
        description={`"${deleteTarget?.name ?? ''}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await handleDelete(deleteTarget._id);
          setDeleteTarget(null);
        }}
      />

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              {selectedTemplate?.category} • {selectedTemplate?.language.toUpperCase()}
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && <TemplatePreviewContent template={selectedTemplate} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
