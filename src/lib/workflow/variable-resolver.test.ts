/**
 * Unit tests for VariableResolver — focused on TODO 2.19:
 *   - the re-injection fix for resolved $node values containing quotes/newlines
 *     (previously broke acorn re-parsing of advanced expressions), and
 *   - label-based node references (`node['Label']` / `nodes['Label']`).
 *
 * Pure unit tests — no DB / Redis. Run with `npx vitest run src/lib/workflow/variable-resolver.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
  VariableResolver,
  buildNodeLabelMap,
  type ExecutionContext,
} from './variable-resolver';

function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    workflowId: 'wf1',
    executionId: 'ex1',
    organizationId: 'org1',
    userId: 'user1',
    triggerData: {},
    variables: {},
    nodeOutputs: new Map(),
    systemVariables: {},
    ...overrides,
  };
}

describe('VariableResolver — re-injection of resolved node values (2.19)', () => {
  it('handles resolved string values containing double quotes', () => {
    const ctx = makeContext({
      nodeOutputs: new Map<string, unknown>([['n1', { name: 'Acme "Inc"' }]]),
    });
    const r = new VariableResolver(ctx);
    // Advanced expression (string concat) forces the re-injection path.
    const out = r.resolve('{{$n1.name + "!"}}');
    expect(out).toBe('Acme "Inc"!');
  });

  it('handles resolved string values containing newlines (the regression)', () => {
    const ctx = makeContext({
      nodeOutputs: new Map<string, unknown>([['n1', { body: 'line1\nline2' }]]),
    });
    const r = new VariableResolver(ctx);
    // The old naive `"..."` wrapper produced an unterminated string literal here
    // and threw; with JSON.stringify the literal is valid.
    const out = r.resolve('{{$n1.body + "_end"}}');
    expect(out).toBe('line1\nline2_end');
  });

  it('handles backslashes and tabs without breaking the expression', () => {
    const ctx = makeContext({
      nodeOutputs: new Map<string, unknown>([['n1', { path: 'C:\\tmp\tfile' }]]),
    });
    const r = new VariableResolver(ctx);
    const out = r.resolve('{{$n1.path + ""}}');
    expect(out).toBe('C:\\tmp\tfile');
  });

  it('handles unicode line/paragraph separators (U+2028 / U+2029)', () => {
    const ctx = makeContext({
      nodeOutputs: new Map<string, unknown>([['n1', { txt: 'a b c' }]]),
    });
    const r = new VariableResolver(ctx);
    const out = r.resolve('{{$n1.txt + "!"}}');
    expect(out).toBe('a b c!');
  });

  it('re-injects objects as JSON and supports member access on them', () => {
    const ctx = makeContext({
      nodeOutputs: new Map<string, unknown>([['n1', { user: { age: 30 } }]]),
    });
    const r = new VariableResolver(ctx);
    const out = r.resolve('{{$n1.user.age + 5}}');
    expect(out).toBe('35');
  });

  it('coerces non-finite numbers to null instead of an invalid literal', () => {
    const ctx = makeContext({
      nodeOutputs: new Map<string, unknown>([['n1', { x: Infinity }]]),
    });
    const r = new VariableResolver(ctx);
    // Infinity is not a valid JS literal; toExpressionLiteral emits `null`.
    const out = r.resolve('{{$n1.x || 7}}');
    expect(out).toBe('7');
  });
});

describe('VariableResolver — label-based node refs (2.19)', () => {
  const ctx = makeContext({
    nodeOutputs: new Map<string, unknown>([
      ['node_abc123', { messageId: 'm-1', count: 2 }],
    ]),
    nodeLabels: { 'Send Email': 'node_abc123' },
  });

  it('resolves a simple label ref via single quotes', () => {
    const r = new VariableResolver(ctx);
    expect(r.resolve("{{node['Send Email'].messageId}}")).toBe('m-1');
  });

  it('resolves a label ref via double quotes and the plural alias', () => {
    const r = new VariableResolver(ctx);
    expect(r.resolve('{{nodes["Send Email"].messageId}}')).toBe('m-1');
  });

  it('supports label refs inside advanced expressions', () => {
    const r = new VariableResolver(ctx);
    expect(r.resolve("{{nodes['Send Email'].count + 1}}")).toBe('3');
  });

  it('keeps ID-based refs working alongside label refs', () => {
    const r = new VariableResolver(ctx);
    expect(r.resolve('{{$node_abc123.messageId}}')).toBe('m-1');
  });

  it('leaves unknown labels untouched (resolves to undefined)', () => {
    const r = new VariableResolver(ctx);
    // Unknown label is not rewritten; the {{...}} keeps its original text.
    expect(r.resolve("{{node['Nope'].messageId}}")).toBe("{{node['Nope'].messageId}}");
  });
});

describe('buildNodeLabelMap', () => {
  it('maps trimmed labels to node ids', () => {
    const map = buildNodeLabelMap([
      { id: 'a', data: { label: '  First ' } },
      { id: 'b', data: { label: 'Second' } },
    ]);
    expect(map).toEqual({ First: 'a', Second: 'b' });
  });

  it('first match wins on duplicate labels', () => {
    const map = buildNodeLabelMap([
      { id: 'a', data: { label: 'Dup' } },
      { id: 'b', data: { label: 'Dup' } },
    ]);
    expect(map.Dup).toBe('a');
  });

  it('skips nodes with no label', () => {
    const map = buildNodeLabelMap([{ id: 'a', data: {} }, { id: 'b' }]);
    expect(map).toEqual({});
  });
});
