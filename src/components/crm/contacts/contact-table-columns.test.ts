import { it, expect } from 'vitest';

import React from 'react';

import { FavoriteButton } from '@/components/crm/favorites/favorite-button';
import { Contact } from '@/types/crm';
import { getContactColumns } from './contact-table-columns';

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

function buildContact(overrides: Partial<Contact> = {}): Contact {
  return {
    _id: 'contact-1',
    organizationId: 'org-1',
    firstName: 'Ava',
    lastName: 'Stone',
    channels: [],
    source: 'manual',
    status: 'lead',
    lifecycle: 'lead',
    rating: 'warm',
    score: 42,
    tags: [],
    customFields: {},
    totalActivities: 0,
    totalEmails: 0,
    marketingConsent: false,
    doNotContact: false,
    createdById: 'user-1',
    createdAt: new Date('2026-03-20T00:00:00.000Z'),
    updatedAt: new Date('2026-03-20T00:00:00.000Z'),
    ...overrides,
  };
}

it('getContactColumns renders a favorite button with the resolved favorite state', () => {
  const contact = buildContact();
  const toggles: Array<{ targetId: string; isFavorite: boolean }> = [];
  const columns = getContactColumns(undefined, undefined, {
    isFavorite: (targetId) => targetId === contact._id,
    onFavoriteToggle: (targetId, isFavorite) => {
      toggles.push({ targetId, isFavorite });
    },
  });

  const contactColumn = columns[0];
  // @ts-expect-error
  expect(contactColumn.accessorKey).toBe('firstName');
  expect(contactColumn.cell).toBeTruthy();
  const renderCell = contactColumn.cell as (context: { row: { original: Contact } }) => unknown;

  const element = renderCell({
    row: {
      original: contact,
    },
  });

  const favoriteButton = findElementByType(element, FavoriteButton);

  expect(favoriteButton).toBeTruthy();
  // @ts-expect-error
  expect(favoriteButton.props.targetType).toBe('contact');
  // @ts-expect-error
  expect(favoriteButton.props.targetId).toBe(contact._id);
  // @ts-expect-error
  expect(favoriteButton.props.initialIsFavorite).toBe(true);

  // @ts-expect-error
  favoriteButton.props.onToggle(false);

  expect(toggles).toEqual([{ targetId: contact._id, isFavorite: false }]);
});
