import { it, expect } from 'vitest';

import React from 'react';

import { Deal } from '@/types/crm';
import { getDealColumns } from './deal-table-columns';

globalThis.React = React;

interface ReactElementLike {
  type?: unknown;
  props?: {
    children?: unknown;
    [key: string]: unknown;
  };
}

function isReactElementLike(value: unknown): value is ReactElementLike {
  return typeof value === 'object' && value !== null;
}

function findText(element: unknown, matcher: (text: string) => boolean): boolean {
  if (typeof element === 'string') {
    return matcher(element);
  }

  if (!isReactElementLike(element)) {
    return false;
  }

  const children = element.props?.children;
  if (Array.isArray(children)) {
    return children.some((child) => findText(child, matcher));
  }

  return findText(children, matcher);
}

function buildDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    _id: 'deal-1',
    organizationId: 'org-1',
    pipelineId: 'pipeline-1',
    stageId: 'stage-1',
    name: 'Montr Expansion',
    value: 25000,
    currency: 'USD',
    probability: 65,
    status: 'open',
    tags: [],
    customFields: {},
    priority: 'high',
    totalActivities: 0,
    stageHistory: [],
    createdById: 'user-1',
    createdAt: new Date('2026-03-20T00:00:00.000Z'),
    updatedAt: new Date('2026-03-20T00:00:00.000Z'),
    ...overrides,
  };
}

it('getDealColumns renders core deal fields for list view', () => {
  const deal = buildDeal();
  const columns = getDealColumns();

  const nameColumn = columns[0];
  // @ts-expect-error
  expect(nameColumn.accessorKey).toBe('name');
  expect(nameColumn.cell).toBeTruthy();
  const renderNameCell = nameColumn.cell as (context: { row: { original: Deal } }) => unknown;
  const nameElement = renderNameCell({ row: { original: deal } });

  expect(findText(nameElement, (text) => text.includes('Montr Expansion'))).toBe(true);

  // @ts-expect-error
  const valueColumn = columns.find((column) => column.accessorKey === 'value');
  expect(valueColumn?.cell).toBeTruthy();
  const renderValueCell = valueColumn.cell as (context: { getValue: () => number; row: { original: Deal } }) => unknown;
  const valueElement = renderValueCell({
    getValue: () => 25000,
    row: { original: deal },
  });

  expect(findText(valueElement, (text) => text.includes('$25,000'))).toBe(true);
});
