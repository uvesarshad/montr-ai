export function sanitizeHtmlAttribute(value: string) {
  return value.replace(/"/g, '&quot;');
}

export function buildLinkedFormEmbedSection({
  formId,
  formTitle,
}: {
  formId: string;
  formTitle: string;
}) {
  const safeFormTitle = sanitizeHtmlAttribute(formTitle);

  return [
    '<h2>Linked form</h2>',
    `<form-embed formId="${formId}" title="${safeFormTitle}" displayMode="summary"></form-embed>`,
    '<p></p>',
    '<h2>Latest submissions</h2>',
    `<form-embed formId="${formId}" title="${safeFormTitle}" displayMode="responses"></form-embed>`,
    '<p></p>',
    '<h2>Live form</h2>',
    `<form-embed formId="${formId}" title="${safeFormTitle}" displayMode="form"></form-embed>`,
    '<p></p>',
  ].join('');
}
