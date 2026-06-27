/**
 * Catalog of the configurable sections on CRM record-detail pages.
 *
 * This is the single source of truth for what a record-layout can reorder /
 * hide. Each entry reflects a section the detail page ACTUALLY renders today
 * (the tabs in the main column + the sidebar). The `defaultOrder` + `column`
 * here encode the current out-of-the-box layout — when no saved layout exists,
 * sections render exactly in this order.
 *
 * Used by:
 *  - the record-layout settings UI (rows to toggle/reorder)
 *  - the API zod validation (allowed section keys per entity)
 *  - `useRecordLayout` / detail pages (default layout + key→meta lookup)
 */

export type RecordLayoutEntityType = 'contact' | 'company' | 'deal';
export type RecordLayoutColumn = 'main' | 'side';

export interface RecordLayoutSectionDef {
  key: string;
  label: string;
  column: RecordLayoutColumn;
  defaultOrder: number;
}

const CONTACT_SECTIONS: RecordLayoutSectionDef[] = [
  { key: 'overview', label: 'Overview', column: 'main', defaultOrder: 0 },
  { key: 'timeline', label: 'Timeline', column: 'main', defaultOrder: 1 },
  { key: 'activities', label: 'Activities', column: 'main', defaultOrder: 2 },
  { key: 'comments', label: 'Comments', column: 'main', defaultOrder: 3 },
  { key: 'attachments', label: 'Attachments', column: 'main', defaultOrder: 4 },
  { key: 'emails', label: 'Emails', column: 'main', defaultOrder: 5 },
  { key: 'forms', label: 'Forms', column: 'main', defaultOrder: 6 },
  { key: 'history', label: 'History', column: 'main', defaultOrder: 7 },
  { key: 'sidebar', label: 'Sidebar details', column: 'side', defaultOrder: 0 },
];

const COMPANY_SECTIONS: RecordLayoutSectionDef[] = [
  { key: 'overview', label: 'Overview', column: 'main', defaultOrder: 0 },
  { key: 'contacts', label: 'Contacts', column: 'main', defaultOrder: 1 },
  { key: 'deals', label: 'Deals', column: 'main', defaultOrder: 2 },
  { key: 'timeline', label: 'Timeline', column: 'main', defaultOrder: 3 },
  { key: 'comments', label: 'Comments', column: 'main', defaultOrder: 4 },
  { key: 'attachments', label: 'Attachments', column: 'main', defaultOrder: 5 },
  { key: 'history', label: 'History', column: 'main', defaultOrder: 6 },
  { key: 'sidebar', label: 'Sidebar details', column: 'side', defaultOrder: 0 },
];

const DEAL_SECTIONS: RecordLayoutSectionDef[] = [
  { key: 'overview', label: 'Overview', column: 'main', defaultOrder: 0 },
  { key: 'timeline', label: 'Timeline', column: 'main', defaultOrder: 1 },
  { key: 'comments', label: 'Comments', column: 'main', defaultOrder: 2 },
  { key: 'attachments', label: 'Attachments', column: 'main', defaultOrder: 3 },
  { key: 'history', label: 'History', column: 'main', defaultOrder: 4 },
  { key: 'sidebar', label: 'Sidebar details', column: 'side', defaultOrder: 0 },
];

export const RECORD_LAYOUT_SECTIONS: Record<RecordLayoutEntityType, RecordLayoutSectionDef[]> = {
  contact: CONTACT_SECTIONS,
  company: COMPANY_SECTIONS,
  deal: DEAL_SECTIONS,
};

/** Valid section keys for an entity (used by zod + sanitization). */
export function sectionKeysFor(entityType: RecordLayoutEntityType): string[] {
  return RECORD_LAYOUT_SECTIONS[entityType].map((s) => s.key);
}

export interface RecordLayoutSection {
  key: string;
  visible: boolean;
  order: number;
  column: RecordLayoutColumn;
}

/** The default (current) layout for an entity, as stored-shape sections. */
export function defaultLayoutFor(entityType: RecordLayoutEntityType): RecordLayoutSection[] {
  return RECORD_LAYOUT_SECTIONS[entityType].map((s) => ({
    key: s.key,
    visible: true,
    order: s.defaultOrder,
    column: s.column,
  }));
}

/**
 * Merge a saved layout with the catalog:
 *  - drops saved keys no longer in the catalog
 *  - appends catalog sections missing from the save (new sections) at the end,
 *    visible, in their own column
 * Returns sections sorted by (column-stable) order.
 */
export function mergeLayout(
  entityType: RecordLayoutEntityType,
  saved: RecordLayoutSection[] | null | undefined,
): RecordLayoutSection[] {
  const catalog = RECORD_LAYOUT_SECTIONS[entityType];
  const catalogByKey = new Map(catalog.map((s) => [s.key, s]));
  if (!saved || saved.length === 0) return defaultLayoutFor(entityType);

  const savedByKey = new Map(saved.map((s) => [s.key, s]));
  const result: RecordLayoutSection[] = [];

  // Keep saved sections that still exist in the catalog.
  for (const s of saved) {
    const def = catalogByKey.get(s.key);
    if (!def) continue;
    result.push({
      key: s.key,
      visible: s.visible,
      order: s.order,
      column: s.column ?? def.column,
    });
  }

  // Append catalog sections missing from the save (new), at the end of their column.
  for (const def of catalog) {
    if (savedByKey.has(def.key)) continue;
    const maxOrder = result
      .filter((r) => r.column === def.column)
      .reduce((m, r) => Math.max(m, r.order), -1);
    result.push({ key: def.key, visible: true, order: maxOrder + 1, column: def.column });
  }

  return result.sort((a, b) => a.order - b.order);
}

/** Ordered, visible section keys for a column. */
export function visibleKeys(
  layout: RecordLayoutSection[],
  column: RecordLayoutColumn,
): string[] {
  return layout
    .filter((s) => s.column === column && s.visible)
    .sort((a, b) => a.order - b.order)
    .map((s) => s.key);
}
