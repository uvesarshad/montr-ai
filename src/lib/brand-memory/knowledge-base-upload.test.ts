
import { it, expect } from 'vitest';
import {
  buildKnowledgeBaseFileEntry,
  getKnowledgeBaseFileConfig,
} from './knowledge-base-upload';

it('getKnowledgeBaseFileConfig recognizes pdf files as supported knowledge uploads', () => {
  const config = getKnowledgeBaseFileConfig({
    name: 'brand-guidelines.pdf',
    type: 'application/pdf',
    size: 2048,
  });

  expect(config).toEqual({
    supported: true,
    entryType: 'pdf',
    canExtractTextInBrowser: false,
    extensionLabel: 'PDF',
  });
});

it('getKnowledgeBaseFileConfig recognizes word documents as supported uploads', () => {
  const config = getKnowledgeBaseFileConfig({
    name: 'voice-and-tone.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 4096,
  });

  expect(config).toEqual({
    supported: true,
    entryType: 'document',
    canExtractTextInBrowser: false,
    extensionLabel: 'Word',
  });
});

it('buildKnowledgeBaseFileEntry creates editable fallback content when text extraction is unavailable', () => {
  const entry = buildKnowledgeBaseFileEntry({
    file: {
      name: 'playbook.doc',
      type: 'application/msword',
      size: 1024,
    },
    extractedText: '',
  });

  expect(entry.type).toBe('document');
  expect(entry.metadata.fileName).toBe('playbook.doc');
  expect(entry.metadata.mimeType).toBe('application/msword');
  expect(entry.content).toMatch(/Uploaded file:/);
  expect(entry.content).toMatch(/edit this entry/i);
});
