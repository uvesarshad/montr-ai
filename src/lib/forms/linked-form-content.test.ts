
import { it, expect } from 'vitest';
import { buildLinkedFormEmbedSection, sanitizeHtmlAttribute } from './linked-form-content';

it('sanitizeHtmlAttribute escapes double quotes for embed attributes', () => {
  expect(sanitizeHtmlAttribute('Customer "Discovery" Form')).toBe('Customer &quot;Discovery&quot; Form');
});

it('buildLinkedFormEmbedSection includes summary, responses, and live form blocks', () => {
  const result = buildLinkedFormEmbedSection({
    formId: 'form_123',
    formTitle: 'Customer Discovery',
  });

  expect(result).toMatch(/displayMode="summary"/);
  expect(result).toMatch(/displayMode="responses"/);
  expect(result).toMatch(/displayMode="form"/);
  expect(result).toMatch(/formId="form_123"/);
  expect(result).toMatch(/Customer Discovery/);
});
