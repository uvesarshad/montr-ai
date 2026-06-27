export type FormEmbedDisplayMode = 'form' | 'summary' | 'responses';

export function buildSlashCommandFormEmbedAttrs({
  displayMode,
  linkedFormId,
  linkedFormTitle,
}: {
  displayMode: FormEmbedDisplayMode;
  linkedFormId?: string | null;
  linkedFormTitle?: string | null;
}) {
  return {
    displayMode,
    ...(linkedFormId ? { formId: linkedFormId } : {}),
    ...(linkedFormTitle ? { title: linkedFormTitle } : {}),
  };
}
