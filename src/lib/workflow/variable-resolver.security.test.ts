/**
 * Security + correctness unit tests for VariableResolver — the acorn AST-walker
 * expression evaluator. These complement `variable-resolver.test.ts` (which is
 * scoped to TODO 2.19 re-injection / label refs) by covering:
 *
 *   - happy-path variable resolution across every scope,
 *   - nested object / array-index access and missing-var behaviour, and
 *   - the ADVERSARIAL surface: no `new Function` / arrow / `eval` / `this` /
 *     global (`process`/`require`) reach, `constructor`/`__proto__`/`prototype`
 *     token + runtime blocking, member-access-on-functions blocking, the
 *     string/array method allowlist, and the 2000-char expression cap.
 *
 * Pure unit tests — no DB / Redis / network.
 * Run with: npx vitest run src/lib/workflow/variable-resolver.security.test.ts
 */
import { describe, it, expect } from 'vitest';
import { VariableResolver, type ExecutionContext } from './variable-resolver';

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

// ---------------------------------------------------------------------------
// Happy path — simple variable resolution across scopes
// ---------------------------------------------------------------------------
describe('VariableResolver — simple scope resolution', () => {
  it('resolves workflow variables (variables.* and the var alias)', () => {
    const r = new VariableResolver(makeContext({ variables: { count: 5, name: 'Jo' } }));
    expect(r.evaluateExpression('variables.count')).toBe(5);
    expect(r.evaluateExpression('var.name')).toBe('Jo');
    expect(r.resolve('Hi {{variables.name}}')).toBe('Hi Jo');
  });

  it('resolves trigger data and the contact/deal shortcuts', () => {
    const r = new VariableResolver(
      makeContext({
        triggerData: {
          contact: { email: 'a@b.com', company: { name: 'Acme' } },
          deal: { amount: 1200 },
        },
      })
    );
    expect(r.evaluateExpression('trigger.contact.email')).toBe('a@b.com');
    expect(r.evaluateExpression('contact.company.name')).toBe('Acme');
    expect(r.evaluateExpression('deal.amount')).toBe(1200);
  });

  it('resolves node-output references by id', () => {
    const r = new VariableResolver(
      makeContext({ nodeOutputs: new Map<string, unknown>([['n1', { orderId: '#42' }]]) })
    );
    expect(r.evaluateExpression('$n1.orderId')).toBe('#42');
  });

  it('resolves org/brand vars under the vars namespace', () => {
    const r = new VariableResolver(makeContext({ orgVariables: { senderName: 'Bot' } }));
    expect(r.evaluateExpression('vars.senderName')).toBe('Bot');
  });

  it('resolves system variables (and the sys alias)', () => {
    // organizationId and the owner (userId) coincide here so `system.organization`
    // resolves to the same value in both the multi-tenant build (returns the org)
    // and the single-tenant OSS build (where the org field is owner-scoped to userId).
    const r = new VariableResolver(makeContext({ organizationId: 'acct1', userId: 'acct1' }));
    expect(r.evaluateExpression('system.organization')).toBe('acct1');
    expect(r.evaluateExpression('sys.workflowId')).toBe('wf1');
  });

  it('falls back to variables then trigger data for bare identifiers', () => {
    const r = new VariableResolver(
      makeContext({ variables: { fromVar: 'V' }, triggerData: { fromTrigger: 'T' } })
    );
    expect(r.evaluateExpression('fromVar')).toBe('V');
    expect(r.evaluateExpression('fromTrigger')).toBe('T');
  });
});

// ---------------------------------------------------------------------------
// Nested / array / missing
// ---------------------------------------------------------------------------
describe('VariableResolver — nested, array-index and missing vars', () => {
  it('reads deeply nested object paths', () => {
    const r = new VariableResolver(
      makeContext({ variables: { user: { profile: { city: 'NYC' } } } })
    );
    expect(r.evaluateExpression('variables.user.profile.city')).toBe('NYC');
  });

  it('supports array indexing including index-then-field', () => {
    const r = new VariableResolver(
      makeContext({ variables: { items: [{ name: 'first' }, { name: 'second' }] } })
    );
    expect(r.evaluateExpression('variables.items[0].name')).toBe('first');
    expect(r.evaluateExpression('variables.items[1].name')).toBe('second');
  });

  it('returns undefined for missing vars and out-of-range indexing', () => {
    const r = new VariableResolver(makeContext({ variables: { items: [1] } }));
    expect(r.evaluateExpression('variables.nope')).toBeUndefined();
    expect(r.evaluateExpression('variables.a.b.c')).toBeUndefined();
    expect(r.evaluateExpression('variables.items[9]')).toBeUndefined();
  });

  it('keeps the original {{...}} text when a var cannot be resolved', () => {
    const r = new VariableResolver(makeContext());
    expect(r.resolve('Hello {{variables.missing}}')).toBe('Hello {{variables.missing}}');
  });

  it('passes non-string templates through unchanged', () => {
    const r = new VariableResolver(makeContext());
    expect(r.resolve(undefined as unknown as string)).toBeUndefined();
    expect(r.resolve(42 as unknown as string)).toBe(42 as unknown as string);
  });
});

// ---------------------------------------------------------------------------
// Advanced expressions — arithmetic, logic, helpers (happy path)
// ---------------------------------------------------------------------------
describe('VariableResolver — advanced expressions (allowed)', () => {
  it('evaluates arithmetic and operator precedence', () => {
    const r = new VariableResolver(makeContext({ variables: { a: 2, b: 3 } }));
    expect(r.evaluateExpression('variables.a + variables.b * 2')).toBe(8);
  });

  it('evaluates comparison, logical and ternary operators', () => {
    const r = new VariableResolver(makeContext({ variables: { n: 10 } }));
    expect(r.evaluateExpression('variables.n > 5 ? "big" : "small"')).toBe('big');
    expect(r.evaluateExpression('variables.n >= 10 && true')).toBe(true);
    expect(r.evaluateExpression('null ?? "fallback"')).toBe('fallback');
  });

  it('calls whitelisted helper functions', () => {
    const r = new VariableResolver(makeContext());
    expect(r.evaluateExpression('toUpperCase("hi")')).toBe('HI');
    expect(r.evaluateExpression('max(1, 9, 4)')).toBe(9);
    expect(r.evaluateExpression('round(2.6)')).toBe(3);
  });

  it('allows whitelisted string instance methods', () => {
    const r = new VariableResolver(makeContext({ variables: { s: '  Hello  ' } }));
    expect(r.evaluateExpression('variables.s.trim()')).toBe('Hello');
    expect(r.evaluateExpression('"abc".toUpperCase()')).toBe('ABC');
  });
});

// ---------------------------------------------------------------------------
// ADVERSARIAL — the whole point of the AST walker
// ---------------------------------------------------------------------------
describe('VariableResolver — RCE / sandbox-escape blocking', () => {
  it('blocks function expressions, arrow functions and `new` (no code execution)', () => {
    const r = new VariableResolver(makeContext());
    expect(() => r.evaluateExpression('(function(){ return 1 })()')).toThrow();
    expect(() => r.evaluateExpression('(() => 42)()')).toThrow();
    expect(() => r.evaluateExpression('new Function("return 1")()')).toThrow();
  });

  it('never reaches eval / Function — calling them yields a non-function error', () => {
    const r = new VariableResolver(makeContext());
    // `eval`/`Function` are not in the context map, so the callee resolves to
    // undefined and the walker refuses to call a non-function.
    expect(() => r.evaluateExpression('eval("1+1")')).toThrow();
    expect(() => r.evaluateExpression('Function("return process")()')).toThrow();
  });

  it('does not expose Node globals (process / require / globalThis)', () => {
    const r = new VariableResolver(makeContext());
    // Unknown identifiers resolve to undefined — never the real global.
    expect(r.evaluateExpression('process + ""')).toBe('undefined');
    expect(r.evaluateExpression('typeof require + ""')).toBe('undefined');
    expect(r.evaluateExpression('typeof globalThis + ""')).toBe('undefined');
  });

  it('blocks `this`', () => {
    const r = new VariableResolver(makeContext());
    expect(() => r.evaluateExpression('this + ""')).toThrow();
  });

  it('blocks the constructor / __proto__ / prototype tokens (token filter)', () => {
    const r = new VariableResolver(makeContext({ variables: { s: 'x' } }));
    expect(() => r.evaluateExpression('variables.s.constructor + ""')).toThrow(/forbidden|constructor/i);
    expect(() => r.evaluateExpression('variables.s.__proto__ + ""')).toThrow(/forbidden|__proto__/i);
    expect(() => r.evaluateExpression('variables.s.prototype + ""')).toThrow(/forbidden|prototype/i);
  });

  it('blocks computed prototype-chain access that dodges the token filter', () => {
    const r = new VariableResolver(makeContext({ variables: { o: {} } }));
    // "constr" + "uctor" is not a literal `constructor` token, so it passes the
    // regex filter — the runtime BLOCKED_PROPS guard must still stop it.
    expect(() => r.evaluateExpression('variables.o["constr" + "uctor"]')).toThrow(/not allowed/i);
  });

  it('blocks member access on function objects', () => {
    const r = new VariableResolver(makeContext());
    expect(() => r.evaluateExpression('toUpperCase["nam" + "e"]')).toThrow(/not allowed/i);
  });

  it('enforces the string/array method allowlist', () => {
    const r = new VariableResolver(makeContext({ variables: { s: 'x', arr: [1, 2] } }));
    expect(() => r.evaluateExpression('variables.s.normalize()')).toThrow(/not allowed/i);
    // map() would let an attacker pass a lambda — must be rejected.
    expect(() => r.evaluateExpression('variables.arr.map(1)')).toThrow(/not allowed/i);
  });

  it('rejects expressions over the 2000-char cap', () => {
    const r = new VariableResolver(makeContext({ variables: { a: 1 } }));
    const huge = 'variables.a' + ' + 1'.repeat(600); // > 2000 chars
    expect(huge.length).toBeGreaterThan(2000);
    expect(() => r.evaluateExpression(huge)).toThrow();
  });

  it('resolve() swallows the throw and preserves the original template text', () => {
    const r = new VariableResolver(makeContext());
    // A blocked expression inside a template must not crash resolution; the raw
    // {{...}} is kept verbatim so nothing dangerous is interpolated.
    expect(r.resolve('x{{(() => 9)()}}y')).toBe('x{{(() => 9)()}}y');
  });

  it('validateExpression reports validity without throwing', () => {
    const r = new VariableResolver(makeContext({ variables: { a: 1 } }));
    expect(r.validateExpression('variables.a + 1')).toEqual({ valid: true });
    const bad = r.validateExpression('new Function("x")()');
    expect(bad.valid).toBe(false);
    expect(typeof bad.error).toBe('string');
  });
});
