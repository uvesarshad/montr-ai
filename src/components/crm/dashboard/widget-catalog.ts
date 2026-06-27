/**
 * Catalog of the configurable widgets on the CRM overview dashboard
 * (`/crm`). Twenty Dashboard-lite: a user-configurable, ordered list of
 * widgets bound to the existing CRM stats endpoints.
 *
 * This is the single source of truth for what the dashboard can reorder /
 * hide. Each entry reflects a section the overview ACTUALLY renders today
 * (KPI tiles, AI insights, deal funnel, leaderboard, activity chart, recent
 * activity, summary). `defaultOrder` encodes the current out-of-the-box
 * composition — when no saved dashboard exists, widgets render in this order.
 *
 * Used by:
 *  - the dashboard edit UI (rows to toggle / reorder + "add widget" menu)
 *  - the API zod validation (allowed widget keys)
 *  - `CrmOverview` (default dashboard + key→meta lookup + render gating)
 */

export type CrmWidgetSize = 'sm' | 'md' | 'lg';

export interface CrmWidgetDef {
  key: string;
  label: string;
  /** Grid span hint: sm = 1 col, md = 2 cols, lg = 3 cols (of a 3-col grid). */
  size: CrmWidgetSize;
  /** Which stats endpoint(s) feed this widget (informational). */
  endpoint: string;
  defaultOrder: number;
}

/**
 * Every widget the CRM overview renders today, in default order.
 * KPI tiles are individual widgets so users can hide/reorder each metric.
 */
export const CRM_WIDGETS: CrmWidgetDef[] = [
  { key: 'kpi-contacts', label: 'Contacts KPI', size: 'sm', endpoint: '/api/v2/crm/stats/overview', defaultOrder: 0 },
  { key: 'kpi-companies', label: 'Companies KPI', size: 'sm', endpoint: '/api/v2/crm/stats/overview', defaultOrder: 1 },
  { key: 'kpi-deals-open', label: 'Active Deals KPI', size: 'sm', endpoint: '/api/v2/crm/stats/overview', defaultOrder: 2 },
  { key: 'kpi-tasks-due', label: 'Tasks KPI', size: 'sm', endpoint: '/api/v2/crm/stats/overview', defaultOrder: 3 },
  { key: 'ai-insights', label: 'AI Insights', size: 'lg', endpoint: '/api/v2/crm/stats/{overview,deals}', defaultOrder: 4 },
  { key: 'pipeline-funnel', label: 'Deal Funnel', size: 'md', endpoint: '/api/v2/crm/stats/deals', defaultOrder: 5 },
  { key: 'leaderboard', label: 'Leaderboard', size: 'sm', endpoint: '/api/v2/crm/stats/leaderboard', defaultOrder: 6 },
  { key: 'activity-chart', label: 'Activity Chart', size: 'md', endpoint: '/api/v2/crm/stats/activities', defaultOrder: 7 },
  { key: 'activity-feed', label: 'Recent Activity', size: 'sm', endpoint: '/api/v2/crm/stats/activities', defaultOrder: 8 },
  { key: 'summary', label: 'Quick Summary', size: 'lg', endpoint: '/api/v2/crm/stats/overview', defaultOrder: 9 },
  { key: 'forecast', label: 'Sales Forecast', size: 'md', endpoint: '/api/v2/crm/stats/forecast', defaultOrder: 10 },
];

export const CRM_WIDGET_BY_KEY: Record<string, CrmWidgetDef> = Object.fromEntries(
  CRM_WIDGETS.map((w) => [w.key, w])
);

/** Valid widget keys (used by zod + sanitization). */
export function widgetKeys(): string[] {
  return CRM_WIDGETS.map((w) => w.key);
}

export interface CrmWidget {
  key: string;
  visible: boolean;
  order: number;
}

/** The default (current) dashboard, as stored-shape widgets. */
export function defaultDashboard(): CrmWidget[] {
  return CRM_WIDGETS.map((w) => ({ key: w.key, visible: true, order: w.defaultOrder }));
}

/**
 * Merge a saved dashboard with the catalog:
 *  - drops saved keys no longer in the catalog
 *  - appends new catalog widgets missing from the save at the end (visible)
 * Returns widgets sorted by order.
 */
export function mergeDashboard(saved: CrmWidget[] | null | undefined): CrmWidget[] {
  if (!saved || saved.length === 0) return defaultDashboard();

  const savedByKey = new Map(saved.map((w) => [w.key, w]));
  const result: CrmWidget[] = [];

  for (const w of saved) {
    if (!CRM_WIDGET_BY_KEY[w.key]) continue;
    result.push({ key: w.key, visible: w.visible, order: w.order });
  }

  let maxOrder = result.reduce((m, r) => Math.max(m, r.order), -1);
  for (const def of CRM_WIDGETS) {
    if (savedByKey.has(def.key)) continue;
    result.push({ key: def.key, visible: true, order: ++maxOrder });
  }

  return result.sort((a, b) => a.order - b.order);
}

/** Grid column span class for a widget size (within a 3-col grid). */
export function widgetColSpan(size: CrmWidgetSize): string {
  switch (size) {
    case 'lg':
      return 'lg:col-span-3';
    case 'md':
      return 'lg:col-span-2';
    case 'sm':
    default:
      return 'lg:col-span-1';
  }
}
