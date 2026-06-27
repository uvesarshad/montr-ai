import { it, expect } from 'vitest';

import React from 'react';

import { FavoriteButton } from '@/components/crm/favorites/favorite-button';
import { Company } from '@/types/crm';
import { getCompanyColumns } from './company-table-columns';

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

function findElementByType(element: unknown, type: unknown): ReactElementLike | null {
  if (!isReactElementLike(element)) {
    return null;
  }

  if (element.type === type) {
    return element;
  }

  const children = element.props?.children;

  if (Array.isArray(children)) {
    for (const child of children) {
      const match = findElementByType(child, type);
      if (match) {
        return match;
      }
    }
    return null;
  }

  return findElementByType(children, type);
}

function buildCompany(overrides: Partial<Company> = {}): Company {
  return {
    _id: 'company-1',
    organizationId: 'org-1',
    name: 'MontrAI',
    type: 'prospect',
    tags: [],
    customFields: {},
    contactCount: 0,
    dealCount: 0,
    totalDealValue: 0,
    wonDealValue: 0,
    totalActivities: 0,
    createdById: 'user-1',
    createdAt: new Date('2026-03-20T00:00:00.000Z'),
    updatedAt: new Date('2026-03-20T00:00:00.000Z'),
    ...overrides,
  };
}

it('getCompanyColumns renders a favorite button with the resolved favorite state', () => {
  const company = buildCompany();
  const toggles: Array<{ targetId: string; isFavorite: boolean }> = [];
  const columns = getCompanyColumns(undefined, undefined, {
    isFavorite: (targetId) => targetId === company._id,
    onFavoriteToggle: (targetId, isFavorite) => {
      toggles.push({ targetId, isFavorite });
    },
  });

  const companyColumn = columns[0];
  // @ts-expect-error
  expect(companyColumn.accessorKey).toBe('name');
  expect(companyColumn.cell).toBeTruthy();
  const renderCell = companyColumn.cell as (context: { row: { original: Company } }) => unknown;

  const element = renderCell({
    row: {
      original: company,
    },
  });

  const favoriteButton = findElementByType(element, FavoriteButton);

  expect(favoriteButton).toBeTruthy();
  // @ts-expect-error
  expect(favoriteButton.props.targetType).toBe('company');
  // @ts-expect-error
  expect(favoriteButton.props.targetId).toBe(company._id);
  // @ts-expect-error
  expect(favoriteButton.props.initialIsFavorite).toBe(true);

  // @ts-expect-error
  favoriteButton.props.onToggle(false);

  expect(toggles).toEqual([{ targetId: company._id, isFavorite: false }]);
});
