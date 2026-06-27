
import { it, expect } from 'vitest';
import { getAppHeaderClassNames } from './app-header-styles';

// Shell refactor (eaa5b79, 2026-06-03): the canvas header floats as a card
// (rounded, token shadow) offset past the 60px rail; the standard header is
// flat and full-width — separators come from the workspace hairlines, not a
// header border or shadow.

it('floating canvas header keeps the card treatment (token shadow, rounded, offset past the rail)', () => {
  const classNames = getAppHeaderClassNames({
    isCanvasPage: true,
    isCollapsed: false,
  });

  expect(classNames.header).toMatch(/sm:shadow-\[var\(--app-shadow\)\]/);
  expect(classNames.header).toMatch(/sm:rounded-\[18px\]/);
  expect(classNames.header).toMatch(/sm:left-\[72px\]/);
  expect(classNames.header).not.toMatch(/\bw-full\b/);
});

it('standard header stays flat and full-width (no shadow, no border, no card)', () => {
  const classNames = getAppHeaderClassNames({
    isCanvasPage: false,
    isCollapsed: false,
  });

  expect(classNames.header).not.toMatch(/\bshadow/);
  expect(classNames.header).not.toMatch(/\bborder-b\b/);
  expect(classNames.header).not.toMatch(/\brounded/);
  expect(classNames.header).toMatch(/\bw-full\b/);
});
