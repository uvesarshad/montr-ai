'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  BarChart2,
  BookText,
  Bot,
  Copy,
  FileText,
  Globe,
  Layers3,
  List,
  Loader2,
  Lock,
  Mail,
  Plus,
  Trash2,
} from 'lucide-react';

import { useAppHeader } from '@/components/app-header';
import {
  Button,
  Chip,
  KpiTile,
  SearchInput,
  Skeleton,
  EmptyState,
  BulkBar,
  ActionMenu,
  ConfirmDialog,
  type Pastel,
} from '@/components/ui-kit';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useForms } from '@/hooks/use-forms';
import { IFormTemplate, useFormTemplates } from '@/hooks/use-templates';
import { cn } from '@/lib/utils';

import styles from './forms.module.css';

function getTemplateIcon(icon: IFormTemplate['icon']) {
  if (icon === 'Mail') return Mail;
  if (icon === 'BarChart2') return BarChart2;
  return FileText;
}

type LinkedNoteRecord = {
  _id: string;
  title: string;
  referenceId?: string | null;
  updatedAt?: string;
};

function buildLinkedNoteSeed(form: { _id: string; title: string }) {
  const linkedDocTitle = `${form.title} notes`;
  const safeFormTitle = form.title.replace(/"/g, '&quot;');

  return {
    title: linkedDocTitle,
    content: [
      `<h1>${linkedDocTitle}</h1>`,
      '<p>Use this note to capture form goals, audience context, response analysis, and iteration ideas.</p>',
      `<form-embed formId="${form._id}" title="${safeFormTitle}" displayMode="summary"></form-embed>`,
      '<p></p>',
      '<h2>Latest submissions</h2>',
      `<form-embed formId="${form._id}" title="${safeFormTitle}" displayMode="responses"></form-embed>`,
      '<p></p>',
      '<h2>Live form</h2>',
      `<form-embed formId="${form._id}" title="${safeFormTitle}" displayMode="form"></form-embed>`,
      '<p></p>',
      '<h2>Notes</h2>',
      '<p></p>',
    ].join(''),
  };
}

function getRelativeTime(value?: string | Date) {
  if (!value) return 'No activity yet';
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

const FormActionMenu = ({
  formId,
  onDeleteRequest,
  onViewSubmissions,
}: {
  formId: string;
  onDeleteRequest: (id: string) => void;
  onViewSubmissions: (formId: string) => void;
}) => {
  return (
    <ActionMenu
      items={[
        {
          label: 'View Submissions',
          icon: List,
          onSelect: () => onViewSubmissions(formId),
        },
        {
          label: 'Duplicate',
          icon: Copy,
          onSelect: () => {},
        },
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          separatorBefore: true,
          onSelect: () => onDeleteRequest(formId),
        },
      ]}
    />
  );
};

export default function FormsPage() {
  const { setHeaderInfo } = useAppHeader();
  const { forms, isLoading, createForm, deleteForm, updateForm } = useForms();
  const { templates, isLoading: isTemplatesLoading } = useFormTemplates();
  const { push: routerPush } = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const isNew = searchParams.get('new');

  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [linkedDocsByFormId, setLinkedDocsByFormId] = useState<Record<string, LinkedNoteRecord>>({});
  const [linkingFormId, setLinkingFormId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  const handleCreate = useCallback(
    async (templateId?: string) => {
      setIsCreating(true);
      try {
        const newForm = await createForm(templateId);
        routerPush(`/forms/${newForm._id}`);
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Could not create form.',
        });
        setIsCreating(false);
      }
    },
    [createForm, routerPush, toast],
  );

  const handleCreateRef = useRef(handleCreate);

  useEffect(() => {
    handleCreateRef.current = handleCreate;
  }, [handleCreate]);

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'Forms',
      description: 'Response capture workspace',
      actions: (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Bot}
            onClick={() => window.dispatchEvent(new CustomEvent('open-agent', { detail: { prompt: 'Analyze my forms and suggest improvements to increase submission rates or response quality.' } }))}
          >
            Ask Agent
          </Button>
          <Button
            variant="brand"
            size="sm"
            icon={isCreating ? undefined : Plus}
            onClick={() => handleCreateRef.current()}
            disabled={isCreating}
          >
            {isCreating ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            New Form
          </Button>
        </div>
      ),
    });
  }, [isCreating, setHeaderInfo]);

  useEffect(() => {
    if (isNew === 'true' && !isCreating) {
      void handleCreate();
    }
  }, [handleCreate, isCreating, isNew]);

  const formsList = useMemo(() => forms ?? [], [forms]);
  const filteredForms = useMemo(
    () => formsList.filter((form) => form.title.toLowerCase().includes(searchQuery.toLowerCase())),
    [formsList, searchQuery],
  );

  useEffect(() => {
    let isCancelled = false;

    const loadLinkedNotes = async () => {
      try {
        const response = await fetch('/api/v2/documents?referenceType=form&sortBy=updatedAt');
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const map: Record<string, LinkedNoteRecord> = {};

        for (const doc of data.documents || []) {
          if (doc.referenceId && !map[doc.referenceId]) {
            map[doc.referenceId] = doc;
          }
        }

        if (!isCancelled) {
          setLinkedDocsByFormId(map);
        }
      } catch (error) {
        console.error('Failed to load linked notes:', error);
      }
    };

    void loadLinkedNotes();

    return () => {
      isCancelled = true;
    };
  }, []);

  const publishedCount = formsList.filter((form) => form.isPublished).length;
  const draftCount = formsList.length - publishedCount;
  const totalViews = formsList.reduce((sum, form) => sum + (form.views || 0), 0);
  const totalSubmissions = formsList.reduce((sum, form) => sum + (form.submissionsCount || 0), 0);
  const linkedNotesCount = Object.keys(linkedDocsByFormId).length;
  const latestForm = formsList[0];

  const toggleSelected = (id: string) => {
    setSelectedForms((prev) =>
      prev.includes(id) ? prev.filter((formId) => formId !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (!filteredForms.length) return;
    const filteredIds = filteredForms.map((form) => form._id);
    const allFilteredSelected = filteredIds.every((id) => selectedForms.includes(id));

    setSelectedForms((prev) =>
      allFilteredSelected
        ? prev.filter((id) => !filteredIds.includes(id))
        : Array.from(new Set([...prev, ...filteredIds])),
    );
  };

  const allSelected =
    filteredForms.length > 0 && filteredForms.every((form) => selectedForms.includes(form._id));

  const handleBulkPublish = async (status: boolean) => {
    if (!selectedForms.length) return;
    try {
      await Promise.all(selectedForms.map((id) => updateForm(id, { isPublished: status })));
      toast({
        title: status ? 'Forms Published' : 'Forms Unpublished',
        description: `${selectedForms.length} form(s) updated.`,
      });
      setSelectedForms([]);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update forms.',
      });
    }
  };

  const handleBulkShare = () => {
    if (!selectedForms.length) return;
    const urls = selectedForms
      .map((id) => `${window.location.origin}/submit/${id}`)
      .join('\n');
    void navigator.clipboard.writeText(urls);
    toast({
      title: 'Links Copied',
      description: `${selectedForms.length} link(s) copied to clipboard.`,
    });
    setSelectedForms([]);
  };

  const handleBulkDelete = async () => {
    if (!selectedForms.length) return;

    try {
      await Promise.all(selectedForms.map((id) => deleteForm(id)));
      setSelectedForms([]);
      toast({
        title: 'Forms Deleted',
        description: 'Selected forms have been removed.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: 'Could not delete the selected forms.',
      });
    }
  };

  const handleOpenLinkedNote = useCallback(
    async (form: { _id: string; title: string }) => {
      setLinkingFormId(form._id);

      try {
        const existingDoc = linkedDocsByFormId[form._id];
        if (existingDoc?._id) {
          routerPush(`/docs/${existingDoc._id}`);
          return;
        }

        const linkedDocSeed = buildLinkedNoteSeed(form);
        const createDocResponse = await fetch('/api/v2/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: linkedDocSeed.title,
            content: linkedDocSeed.content,
            referenceId: form._id,
            referenceType: 'form',
          }),
        });

        if (!createDocResponse.ok) {
          throw new Error('Failed to create linked note');
        }

        const newDoc = await createDocResponse.json();
        setLinkedDocsByFormId((current) => ({
          ...current,
          [form._id]: newDoc,
        }));
        routerPush(`/docs/${newDoc._id}`);
      } catch (error) {
        console.error(error);
        toast({
          variant: 'destructive',
          title: 'Linked note unavailable',
          description: 'Could not open or create the linked note for this form.',
        });
      } finally {
        setLinkingFormId(null);
      }
    },
    [linkedDocsByFormId, routerPush, toast],
  );

  const statCards: Array<{
    label: string;
    value: React.ReactNode;
    helper: string;
    detail: string;
    icon: typeof FileText;
    pastel: Pastel;
  }> = [
    {
      label: 'Forms',
      value: formsList.length,
      helper: latestForm?.title || 'No forms yet',
      detail: latestForm?.updatedAt ? `Updated ${getRelativeTime(latestForm.updatedAt)}` : 'Create your first form',
      icon: FileText,
      pastel: 'violet',
    },
    {
      label: 'Published',
      value: publishedCount,
      helper: `${draftCount} still in draft`,
      detail: 'Forms available to respondents',
      icon: Globe,
      pastel: 'mint',
    },
    {
      label: 'Drafts',
      value: draftCount,
      helper: 'Forms still being shaped',
      detail: 'Unpublished collection flows',
      icon: Lock,
      pastel: 'peach',
    },
    {
      label: 'Submissions',
      value: totalSubmissions,
      helper: 'Captured responses',
      detail: `${totalViews} combined views`,
      icon: BarChart2,
      pastel: 'blue',
    },
    {
      label: 'Linked Notes',
      value: linkedNotesCount,
      helper: 'Docs connected to forms',
      detail: selectedForms.length > 0 ? `${selectedForms.length} selected` : 'Use notes for context and analysis',
      icon: BookText,
      pastel: 'lemon',
    },
  ];

  const templatePreview = templates.slice(0, 4);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.statsRow}>
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={`stat-sk-${index}`} className="h-[82px] rounded-[12px]" />
          ))}
        </div>
        <Skeleton className="h-[162px] rounded-[12px]" />
        <Skeleton className="h-[520px] rounded-[16px]" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.statsRow}>
        {statCards.map((card) => (
          <KpiTile
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            pastel={card.pastel}
            sub={
              <>
                <span className="block truncate text-[12px] text-muted-foreground">{card.helper}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground/80">{card.detail}</span>
              </>
            }
          />
        ))}
      </section>

      <section className={cn('app-glass', styles.templateStrip)}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionTitle}>Quick Start</p>
            <p className={styles.sectionSubtitle}>
              Start with a blank form or launch from a template, using the same UI rhythm as the automation workspace.
            </p>
          </div>
        </div>

        <div className={styles.templateRow}>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isCreating}
            className={styles.newTemplateCard}
          >
            <div className={styles.newTemplateIcon}>
              {isCreating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            </div>
            <div>
              <p className={styles.newTemplateLabel}>Blank Form</p>
              <p className={styles.newTemplateSubtext}>Start from scratch with an empty response flow.</p>
            </div>
          </button>

          {isTemplatesLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={`tmpl-sk-${index}`} className={styles.templateCard}>
                  <Skeleton className="size-6 rounded-md" />
                  <Skeleton className="mt-4 h-4 w-24" />
                  <Skeleton className="mt-2 h-3 w-full" />
                </div>
              ))
            : templatePreview.map((template, index) => {
                const Icon = getTemplateIcon(template.icon);
                const toneClass =
                  index % 4 === 0
                    ? styles.templateTonePrimary
                    : index % 4 === 1
                      ? styles.templateToneBlue
                      : index % 4 === 2
                        ? styles.templateToneGreen
                        : styles.templateToneAmber;

                return (
                  <button
                    key={template._id}
                    type="button"
                    onClick={() => void handleCreate(template._id)}
                    disabled={isCreating}
                    className={cn(styles.templateCard, toneClass)}
                  >
                    <span className={styles.templateCategory}>Template</span>
                    <div
                      className={cn(
                        styles.templateIcon,
                        index % 4 === 0
                          ? styles.iconPurple
                          : index % 4 === 1
                            ? styles.iconBlue
                            : index % 4 === 2
                              ? styles.iconGreen
                              : styles.iconAmber,
                      )}
                    >
                      <Icon className="size-3.5" />
                    </div>
                    <p className={styles.templateName}>{template.title}</p>
                    <p className={styles.templateDescription}>{template.description}</p>
                    <div className={styles.templateFooter}>
                      <span>Starter flow</span>
                      <span className={styles.templateUse}>Use</span>
                    </div>
                  </button>
                );
              })}
        </div>
      </section>

      <section className={cn('app-glass', styles.librarySection)}>
        <div className={styles.toolbarWrap}>
          {selectedForms.length > 0 ? (
            <BulkBar count={selectedForms.length} onClear={() => setSelectedForms([])}>
              <Button variant="ghost" size="sm" onClick={() => void handleBulkPublish(true)}>Publish</Button>
              <Button variant="ghost" size="sm" onClick={() => void handleBulkPublish(false)}>Unpublish</Button>
              <Button variant="ghost" size="sm" onClick={handleBulkShare}>Share</Button>
              <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-muted" onClick={() => setIsBulkDeleteOpen(true)}>Delete</Button>
            </BulkBar>
          ) : null}

          <div className={cn(styles.toolbar, selectedForms.length > 0 && styles.toolbarHidden)}>
            <div className={styles.toolbarMain}>
              <div className={styles.toolbarIcon}>
                <Layers3 className="size-4" />
              </div>
              <SearchInput
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search forms..."
                wrapClassName="w-[240px] max-w-full"
              />
            </div>

            <div className={styles.toolbarRight}>
              <div className={styles.viewToggle}>
                <button
                  type="button"
                  className={cn(styles.viewButton, viewMode === 'grid' && styles.viewButtonActive)}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                >
                  <Layers3 className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={cn(styles.viewButton, viewMode === 'list' && styles.viewButtonActive)}
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                >
                  <List className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.libraryBody}>
          {filteredForms.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={formsList.length === 0 ? 'No forms yet' : 'No forms match this search'}
              note={formsList.length === 0
                ? 'Create a blank form or start from a template.'
                : 'Try a different search term or clear the current filter.'}
              cta={formsList.length === 0 ? (
                <Button variant="brand" size="sm" icon={Plus} onClick={() => void handleCreate()}>
                  Create Form
                </Button>
              ) : undefined}
            />
          ) : viewMode === 'list' ? (
            <div className={styles.formList}>
              <div className={styles.listHeader}>
                <div className={styles.listHeaderMain}>
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} className="border-[color:var(--app-border-strong)]" />
                  <span>Form</span>
                </div>
                <span className={styles.listHeaderCell}>Status</span>
                <span className={styles.listHeaderCell}>Note</span>
                <span className={styles.listHeaderCell}>Updated</span>
                <span className={styles.listHeaderCell}>Responses</span>
                <span />
              </div>

              {filteredForms.map((form) => {
                const linkedDoc = linkedDocsByFormId[form._id];
                const isLinkingNote = linkingFormId === form._id;

                return (
                  <div
                    key={form._id}
                    className={cn(styles.listRow, selectedForms.includes(form._id) && styles.listRowSelected)}
                  >
                    <div className={styles.listMain}>
                      <Checkbox
                        checked={selectedForms.includes(form._id)}
                        onCheckedChange={() => toggleSelected(form._id)}
                        className="border-[color:var(--app-border-strong)]"
                      />
                      <Link href={`/forms/${form._id}`} className={styles.formIdentity}>
                        <div className={cn(styles.formIdentityIcon, styles.iconPurple)}>
                          <FileText className="size-3.5" />
                        </div>
                        <div className={styles.formIdentityCopy}>
                          <p className={styles.formTitle}>{form.title}</p>
                          <p className={styles.formSubline}>
                            /submit/{form._id.slice(-6)} | {form.views || 0} views
                          </p>
                        </div>
                      </Link>
                    </div>

                    <div className={styles.listCell}>
                      <Chip tone={form.isPublished ? 'ok' : 'gray'}>
                        {form.isPublished ? 'Published' : 'Draft'}
                      </Chip>
                    </div>

                    <div className={styles.listCell}>
                      <button
                        type="button"
                        className={styles.noteButton}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleOpenLinkedNote(form);
                        }}
                        disabled={isLinkingNote}
                      >
                        <BookText className="size-3" />
                        {isLinkingNote ? 'Opening...' : linkedDoc ? 'Open note' : 'Create note'}
                      </button>
                    </div>

                    <div className={styles.listCellMuted}>{format(new Date(form.updatedAt), 'MMM d, yyyy')}</div>
                    <div className={styles.listCellMuted}>{form.submissionsCount || 0}</div>
                    <div className={styles.listActions}>
                      <FormActionMenu formId={form._id} onDeleteRequest={setDeleteTargetId} onViewSubmissions={(id) => routerPush(`/forms/${id}/submissions`)} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.formGrid}>
              {filteredForms.map((form) => {
                const isSelected = selectedForms.includes(form._id);
                const linkedDoc = linkedDocsByFormId[form._id];
                const isLinkingNote = linkingFormId === form._id;

                return (
                  <article
                    key={form._id}
                    className={cn(styles.formCard, isSelected && styles.formCardSelected)}
                  >
                    <div className={styles.formCardTop}>
                      <div className={styles.formCardSelection}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelected(form._id)}
                          className={cn(
                            'border-[color:var(--app-border-strong)] bg-[color:var(--app-surface-strong)] transition-opacity data-[state=checked]:border-primary data-[state=checked]:bg-primary',
                            !isSelected && 'opacity-0 group-hover:opacity-100',
                          )}
                        />
                      </div>

                      <div className={cn(styles.formIdentityIcon, styles.iconPurple)}>
                        <FileText className="size-4" />
                      </div>

                      <div className={styles.formCardHead}>
                        <Link href={`/forms/${form._id}`} className={styles.formTitleLink}>
                          {form.title}
                        </Link>
                        <p className={styles.formSubline}>
                          Updated {getRelativeTime(form.updatedAt)}
                        </p>
                      </div>

                      <FormActionMenu formId={form._id} onDeleteRequest={setDeleteTargetId} onViewSubmissions={(id) => routerPush(`/forms/${id}/submissions`)} />
                    </div>

                    <div className={styles.formCardStats}>
                      <div className={styles.formStat}>
                        <span className={styles.formStatLabel}>Status</span>
                        <span className={styles.formStatValue}>{form.isPublished ? 'Live' : 'Draft'}</span>
                      </div>
                      <div className={styles.formStat}>
                        <span className={styles.formStatLabel}>Views</span>
                        <span className={styles.formStatValue}>{form.views || 0}</span>
                      </div>
                      <div className={styles.formStat}>
                        <span className={styles.formStatLabel}>Responses</span>
                        <span className={styles.formStatValue}>{form.submissionsCount || 0}</span>
                      </div>
                    </div>

                    <div className={styles.formCardFooter}>
                      <button
                        type="button"
                        className={styles.noteButton}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleOpenLinkedNote(form);
                        }}
                        disabled={isLinkingNote}
                      >
                        <BookText className="size-3" />
                        {isLinkingNote ? 'Opening...' : linkedDoc ? 'Open note' : 'Create note'}
                      </button>

                      <div className={styles.formCardLinks}>
                        <Link href={`/forms/${form._id}`} className={styles.inlineLink}>
                          Open
                        </Link>
                        <Link href={`/forms/${form._id}/submissions`} className={styles.inlineLink}>
                          Responses
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="Delete form?"
        description="This will permanently delete the form and its data. This action cannot be undone."
        onConfirm={async () => { if (deleteTargetId) await deleteForm(deleteTargetId); }}
      />

      <ConfirmDialog
        open={isBulkDeleteOpen}
        onOpenChange={setIsBulkDeleteOpen}
        title="Delete selected forms?"
        description={`This will permanently delete ${selectedForms.length} form${selectedForms.length === 1 ? '' : 's'} and their data. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
