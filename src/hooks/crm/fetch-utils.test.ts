import { it, expect } from 'vitest';

import { isCancelledRequestError } from './fetch-utils';

it('isCancelledRequestError detects AbortError instances', () => {
  const controller = new AbortController();
  controller.abort();

  const error = new DOMException('The operation was aborted.', 'AbortError');

  expect(isCancelledRequestError(error, controller.signal)).toBe(true);
});

it('isCancelledRequestError detects browser fetch failures after abort', () => {
  const controller = new AbortController();
  controller.abort();

  const error = new TypeError('Failed to fetch');

  expect(isCancelledRequestError(error, controller.signal)).toBe(true);
});

it('isCancelledRequestError ignores ordinary fetch failures', () => {
  const controller = new AbortController();
  const error = new TypeError('Failed to fetch');

  expect(isCancelledRequestError(error, controller.signal)).toBe(false);
  expect(isCancelledRequestError(new Error('Unauthorized'))).toBe(false);
});
