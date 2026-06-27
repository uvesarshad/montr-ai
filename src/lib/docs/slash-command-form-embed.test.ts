
import { it, expect } from 'vitest';
import { buildSlashCommandFormEmbedAttrs } from './slash-command-form-embed';

it('buildSlashCommandFormEmbedAttrs includes linked form metadata when available', () => {
  expect(buildSlashCommandFormEmbedAttrs({
      displayMode: 'form',
      linkedFormId: 'form_123',
      linkedFormTitle: 'Customer Intake',
    })).toEqual({
      displayMode: 'form',
      formId: 'form_123',
      title: 'Customer Intake',
    });
});

it('buildSlashCommandFormEmbedAttrs falls back to display mode only without a linked form', () => {
  expect(buildSlashCommandFormEmbedAttrs({
      displayMode: 'responses',
    })).toEqual({
      displayMode: 'responses',
    });
});
