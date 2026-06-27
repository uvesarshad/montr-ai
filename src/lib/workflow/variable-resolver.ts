/**
 * Variable Resolver & Expression Evaluator
 *
 * Resolves template strings with variables and evaluates expressions.
 * Supports:
 * - Simple variable substitution: {{variable}}
 * - Nested object access: {{user.email}}, {{contact.company.name}}
 * - Array indexing: {{items[0].name}}
 * - Node output references: {{$nodeId.field}}
 * - Advanced expressions: {{$node1.count + $node2.count}}
 */

import * as acorn from 'acorn';
import { VariableType } from '../db/models/unified-workflow.model';

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  userId: string;
  contactId?: string;
  dealId?: string;
  triggerData: Record<string, unknown>;
  variables: Record<string, unknown>;
  nodeOutputs: Map<string, unknown>;
  systemVariables: Record<string, unknown>;
  /**
   * Org/brand-level variables (H8). Loaded once per execution from
   * OrgVariable; brand-scoped values override org-level ones. Exposed in
   * expressions under the `vars` namespace, e.g. `{{vars.senderName}}`.
   * This is the concrete realization of `VariableScope.GLOBAL`.
   */
  orgVariables?: Record<string, unknown>;
  /**
   * Visible-label → nodeId map for label-based node references (2.19).
   * Lets expressions reference a node by its human-readable label instead of
   * an opaque internal id, e.g. `{{node['Send Email'].messageId}}` or
   * `{{nodes['Send Email'].count + 1}}`. Built once per execution from the
   * workflow's nodes. Duplicate labels resolve to the FIRST matching node and
   * emit a console warning. ID-based refs (`{{$nodeId.field}}`) keep working.
   */
  nodeLabels?: Record<string, string>;
}

interface AstNode {
  type: string;
  [key: string]: unknown;
}

export class VariableResolver {
  constructor(public context: ExecutionContext) {
    // Add system variables
    this.context.systemVariables = {
      timestamp: Date.now(),
      date: new Date().toISOString(),
      dateShort: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      user: this.context.userId,
      organization: this.context.userId,
      workflowId: this.context.workflowId,
      executionId: this.context.executionId,
      ...this.context.systemVariables
    };
  }

  /**
   * Resolve template string with variables
   * Input: "Hello {{$trigger.contact.firstName}}, your order {{$node1.orderId}} is ready"
   * Output: "Hello John, your order #12345 is ready"
   */
  resolve(template: string): string {
    if (!template || typeof template !== 'string') {
      return template;
    }

    // Find all {{...}} patterns
    const regex = /\{\{([^}]+)\}\}/g;

    return template.replace(regex, (match, expression) => {
      try {
        const result = this.evaluateExpression(expression.trim());
        return result !== undefined && result !== null ? String(result) : match;
      } catch (error) {
        console.error(`Failed to resolve ${match}:`, error);
        return match; // Keep original if failed
      }
    });
  }

  /**
   * Resolve object with nested template strings
   * Recursively resolves all string values in an object
   */
  resolveObject<T = unknown>(obj: unknown): T {
    if (obj === null || obj === undefined) {
      return obj as T;
    }

    if (typeof obj === 'string') {
      return this.resolve(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveObject(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        resolved[key] = this.resolveObject(value);
      }
      return resolved as unknown as T;
    }

    return obj as T;
  }

  /**
   * Evaluate a variable expression
   * Supports: $nodeId.field, variables.key, trigger.data, system.timestamp
   */
  evaluateExpression(expression: string): unknown {
    // Rewrite label-based node refs (`node['Label']` / `nodes['Label']`) into the
    // internal `$nodeId` form before anything else (2.19). Idempotent — no
    // bracket-label form survives the rewrite, so the recursive advanced path
    // can safely call back in.
    expression = this.rewriteLabelRefs(expression);

    // Handle advanced expressions (with operators, functions, etc.)
    if (this.isAdvancedExpression(expression)) {
      return this.evaluateAdvancedExpression(expression);
    }

    // Parse simple expression parts
    const parts = expression.split('.');
    const [scope, ...path] = parts;

    // Resolve based on scope
    if (scope.startsWith('$')) {
      // Node output reference: $nodeId
      const nodeId = scope.substring(1);
      const nodeOutput = this.context.nodeOutputs.get(nodeId);
      return this.getNestedValue(nodeOutput, path);
    } else if (scope === 'variables' || scope === 'var') {
      // Workflow variable: variables.key
      return this.getNestedValue(this.context.variables, path);
    } else if (scope === 'vars') {
      // Org/brand-level variable (VariableScope.GLOBAL): vars.senderName
      return this.getNestedValue(this.context.orgVariables ?? {}, path);
    } else if (scope === 'trigger') {
      // Trigger data: trigger.contact.email
      return this.getNestedValue(this.context.triggerData, path);
    } else if (scope === 'system' || scope === 'sys') {
      // System variable: system.timestamp
      return this.getNestedValue(this.context.systemVariables, path);
    } else if (scope === 'contact') {
      // Contact shortcut: contact.email -> trigger.contact.email
      const triggerContact = (this.context.triggerData as Record<string, unknown>)?.contact;
      return this.getNestedValue(triggerContact, path);
    } else if (scope === 'deal') {
      // Deal shortcut: deal.amount -> trigger.deal.amount
      const triggerDeal = (this.context.triggerData as Record<string, unknown>)?.deal;
      return this.getNestedValue(triggerDeal, path);
    } else {
      // Fallback: check variables first, then trigger data
      const varValue = this.context.variables[scope];
      if (varValue !== undefined) {
        return path.length > 0 ? this.getNestedValue(varValue, path) : varValue;
      }

      const triggerValue = this.context.triggerData[scope];
      if (triggerValue !== undefined) {
        return path.length > 0 ? this.getNestedValue(triggerValue, path) : triggerValue;
      }

      return undefined;
    }
  }

  /**
   * Rewrite label-based node references into the internal `$nodeId` form (2.19).
   *
   * Supported forms (label may use single or double quotes):
   *   node['Send Email']          -> $<id>
   *   nodes["Send Email"].count   -> $<id>.count
   *
   * The label is looked up against `context.nodeLabels` (built once per
   * execution). Unknown labels are left untouched (so the downstream evaluator
   * reports them as undefined rather than throwing). Duplicate labels are
   * resolved upstream when the map is built (first match + warning).
   */
  private rewriteLabelRefs(expression: string): string {
    const labels = this.context.nodeLabels;
    if (!labels || expression.indexOf('node') === -1) {
      return expression;
    }
    // Match `node[...]` or `nodes[...]` with a quoted label key.
    return expression.replace(
      /\bnodes?\[\s*(['"])((?:\\.|(?!\1).)*)\1\s*\]/g,
      (full, _quote: string, rawLabel: string) => {
        // Unescape any escaped quote/backslash inside the label.
        const label = rawLabel.replace(/\\(['"\\])/g, '$1');
        const nodeId = labels[label];
        if (!nodeId) {
          return full; // leave as-is; evaluator yields undefined.
        }
        return `$${nodeId}`;
      }
    );
  }

  /**
   * Get nested value from object using path
   * e.g., getNestedValue({user: {name: "John"}}, ["user", "name"]) => "John"
   * Supports array indexing: items[0], items[1].name
   */
  private getNestedValue(obj: unknown, path: string[]): unknown {
    if (path.length === 0) {
      return obj;
    }

    return path.reduce<unknown>((current, key) => {
      if (current === undefined || current === null) {
        return undefined;
      }

      // Handle array indexing: items[0] or items[0].name
      const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, arrayName, index] = arrayMatch;
        const container = (current as Record<string, unknown>)[arrayName];
        if (!Array.isArray(container)) {
          return undefined;
        }
        return container[parseInt(index)];
      }

      if (typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Check if expression contains operators or functions (advanced mode)
   */
  private isAdvancedExpression(expression: string): boolean {
    // Check for operators
    const operators = ['+', '-', '*', '/', '%', '==', '!=', '>', '<', '>=', '<=', '&&', '||', '!', '?', ':'];
    for (const op of operators) {
      if (expression.includes(op)) {
        return true;
      }
    }

    // Check for function calls
    if (/\w+\(/.test(expression)) {
      return true;
    }

    return false;
  }

  /**
   * Evaluate advanced expressions via an AST-based walker (acorn parser).
   *
   * The parser builds an ECMAScript AST; our interpreter only executes a
   * strict whitelist of node types (Literal, Identifier, Binary/Logical/
   * Conditional/Member/Call/Unary/Array/Object/Template). Everything else —
   * `new`, `function`, arrow, assignment, update, tagged templates, `this`,
   * spread into un-allowed calls — throws synchronously.
   *
   * No `new Function` / `eval` is ever reached. Globals (`process`, `require`,
   * `globalThis`, `Function`, `eval`) are not in the context map, so an
   * `Identifier` lookup for them returns undefined. Member access blocks
   * `constructor` / `__proto__` / `prototype` as a final defense-in-depth step.
   */
  evaluateAdvancedExpression(expression: string): unknown {
    try {
      // Substitute $nodeId / $nodeId.path refs into inline literals first —
      // `$` is not a valid identifier start in our walker.
      //
      // The substituted text is re-parsed by acorn as part of the surrounding
      // expression, so it MUST be a valid JS literal. Naively wrapping strings
      // in quotes (the old approach) only escaped `\` and `"` — a resolved value
      // containing a newline, tab, or another control char produced an
      // unterminated/invalid string literal and broke the whole expression.
      // `JSON.stringify` emits a correctly-escaped JS string/number/object/array
      // literal for every JSON-representable value, so it handles quotes,
      // newlines, and unicode line separators safely.
      const resolvedExpression = expression.replace(/\$[\w.[\]]+/g, (match) => {
        return VariableResolver.toExpressionLiteral(this.evaluateExpression(match));
      });

      VariableResolver.assertSafeExpression(resolvedExpression);

      const context: Record<string, unknown> = {
        trigger: this.context.triggerData ?? {},
        variables: this.context.variables ?? {},
        vars: this.context.orgVariables ?? {},
        system: this.context.systemVariables ?? {},
        ...VariableResolver.buildExpressionHelpers(),
      };

      const ast = acorn.parseExpressionAt(resolvedExpression, 0, {
        ecmaVersion: 2020,
        // Don't allow things like `await` or `yield` at the top level.
      }) as unknown as AstNode;

      if ((ast as { end?: number }).end !== resolvedExpression.length) {
        throw new Error('Expression has trailing content');
      }

      return VariableResolver.walkAst(ast, context);
    } catch (error) {
      console.error('Expression evaluation failed:', error);
      throw new Error(`Expression evaluation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Blocked property names on member access — stops prototype-chain escapes
   * even if a user somehow exposes an object that carries these.
   */
  private static readonly BLOCKED_PROPS = new Set([
    'constructor',
    '__proto__',
    'prototype',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
  ]);

  private static walkAst(node: AstNode | null | undefined, ctx: Record<string, unknown>): unknown {
    if (!node || typeof node !== 'object') return undefined;

    // Helpers to coerce loosely-typed AST property accesses
    const asNode = (v: unknown): AstNode => v as AstNode;
    const asStr = (v: unknown): string => v as string;

    switch (node.type) {
      case 'Literal':
        // acorn Literal covers numbers, strings, booleans, null, regex.
        if (node.regex) throw new Error('Regex literals are not allowed');
        return node.value;

      case 'TemplateLiteral': {
        // `Hello ${name}!`
        let out = '';
        const quasis = (node.quasis as Array<{ value: { cooked: string } }>) || [];
        const expressions = (node.expressions as AstNode[]) || [];
        for (let i = 0; i < quasis.length; i++) {
          out += quasis[i].value.cooked;
          if (i < expressions.length) {
            const v = VariableResolver.walkAst(expressions[i], ctx);
            out += v === null || v === undefined ? '' : String(v);
          }
        }
        return out;
      }

      case 'Identifier': {
        const name = asStr(node.name);
        if (VariableResolver.BLOCKED_PROPS.has(name)) {
          throw new Error(`Identifier not allowed: ${name}`);
        }
        return Object.prototype.hasOwnProperty.call(ctx, name)
          ? ctx[name]
          : undefined;
      }

      case 'MemberExpression': {
        const obj = VariableResolver.walkAst(asNode(node.object), ctx);
        if (obj === null || obj === undefined) return undefined;
        const propNode = asNode(node.property);
        let key: unknown;
        if (node.computed) {
          key = VariableResolver.walkAst(propNode, ctx);
        } else {
          key = propNode.name;
        }
        const keyStr = String(key);
        if (VariableResolver.BLOCKED_PROPS.has(keyStr)) {
          throw new Error(`Property not allowed: ${keyStr}`);
        }
        // Only read own enumerable-ish props; block function-object surface
        if (typeof obj === 'function') {
          throw new Error('Member access on functions is not allowed');
        }
        return (obj as Record<string, unknown>)[keyStr];
      }

      case 'CallExpression': {
        const callee = asNode(node.callee);
        let fn: unknown;
        let thisArg: unknown = undefined;
        if (callee.type === 'MemberExpression') {
          thisArg = VariableResolver.walkAst(asNode(callee.object), ctx);
          const propNode = asNode(callee.property);
          const key = callee.computed
            ? VariableResolver.walkAst(propNode, ctx)
            : propNode.name;
          const keyStr = String(key);
          if (VariableResolver.BLOCKED_PROPS.has(keyStr)) {
            throw new Error(`Method not allowed: ${keyStr}`);
          }
          if (thisArg === null || thisArg === undefined) return undefined;
          fn = (thisArg as Record<string, unknown>)[keyStr];
        } else if (callee.type === 'Identifier') {
          const name = asStr(callee.name);
          if (VariableResolver.BLOCKED_PROPS.has(name)) {
            throw new Error(`Call not allowed: ${name}`);
          }
          fn = ctx[name];
        } else {
          throw new Error(`Unsupported callee: ${callee.type}`);
        }
        if (typeof fn !== 'function') {
          throw new Error('Attempted to call non-function');
        }
        // Only allow calls to functions that came from our helper map or that
        // the user explicitly set in their variables. Methods on raw strings
        // are handled below via an allowlist.
        const args = ((node.arguments as AstNode[]) || []).map((a) =>
          VariableResolver.walkAst(a, ctx)
        );
        // Methods on primitives (string, array) — walk an allowlist so we
        // don't let someone call String.prototype methods that return Function.
        if (callee.type === 'MemberExpression' && thisArg != null) {
          const allowedStringMethods = [
            'toUpperCase',
            'toLowerCase',
            'trim',
            'substring',
            'slice',
            'charAt',
            'includes',
            'startsWith',
            'endsWith',
            'indexOf',
            'lastIndexOf',
            'split',
            'replace',
            'replaceAll',
            'repeat',
            'padStart',
            'padEnd',
            'concat',
          ];
          const allowedArrayMethods = [
            'slice',
            'join',
            'includes',
            'indexOf',
            'lastIndexOf',
            'concat',
            'flat',
          ];
          const propNode = asNode(callee.property);
          const method = callee.computed
            ? String(VariableResolver.walkAst(propNode, ctx))
            : asStr(propNode.name);
          if (typeof thisArg === 'string') {
            if (!allowedStringMethods.includes(method)) {
              throw new Error(`String method not allowed: ${method}`);
            }
            return (fn as (...a: unknown[]) => unknown).apply(thisArg, args);
          }
          if (Array.isArray(thisArg)) {
            if (!allowedArrayMethods.includes(method)) {
              throw new Error(`Array method not allowed: ${method}`);
            }
            return (fn as (...a: unknown[]) => unknown).apply(thisArg, args);
          }
        }
        return (fn as (...a: unknown[]) => unknown).apply(thisArg, args);
      }

      case 'BinaryExpression': {
        const l = VariableResolver.walkAst(asNode(node.left), ctx);
        const r = VariableResolver.walkAst(asNode(node.right), ctx);
        const op = asStr(node.operator);
        const ln = l as number;
        const rn = r as number;
        switch (op) {
          case '+':
            // Either string concat or numeric add — accept both at runtime.
            return ((l as number) + (r as number)) as unknown;
          case '-':
            return ln - rn;
          case '*':
            return ln * rn;
          case '/':
            return ln / rn;
          case '%':
            return ln % rn;
          case '**':
            return ln ** rn;
          case '==':
            return l == r;
          case '===':
            return l === r;
          case '!=':
            return l != r;
          case '!==':
            return l !== r;
          case '<':
            return ln < rn;
          case '<=':
            return ln <= rn;
          case '>':
            return ln > rn;
          case '>=':
            return ln >= rn;
          default:
            throw new Error(`Unsupported binary operator: ${op}`);
        }
      }

      case 'LogicalExpression': {
        const l = VariableResolver.walkAst(asNode(node.left), ctx);
        const op = asStr(node.operator);
        if (op === '&&') return l ? VariableResolver.walkAst(asNode(node.right), ctx) : l;
        if (op === '||') return l ? l : VariableResolver.walkAst(asNode(node.right), ctx);
        if (op === '??')
          return l === null || l === undefined
            ? VariableResolver.walkAst(asNode(node.right), ctx)
            : l;
        throw new Error(`Unsupported logical operator: ${op}`);
      }

      case 'UnaryExpression': {
        const v = VariableResolver.walkAst(asNode(node.argument), ctx);
        const op = asStr(node.operator);
        switch (op) {
          case '!':
            return !v;
          case '-':
            return -(v as number);
          case '+':
            return +(v as number);
          case 'typeof':
            return typeof v;
          default:
            throw new Error(`Unsupported unary operator: ${op}`);
        }
      }

      case 'ConditionalExpression': {
        return VariableResolver.walkAst(asNode(node.test), ctx)
          ? VariableResolver.walkAst(asNode(node.consequent), ctx)
          : VariableResolver.walkAst(asNode(node.alternate), ctx);
      }

      case 'ArrayExpression': {
        const elements = (node.elements as Array<AstNode | null>) || [];
        return elements.map((el) =>
          el === null ? null : VariableResolver.walkAst(el, ctx)
        );
      }

      case 'ObjectExpression': {
        const properties = (node.properties as AstNode[]) || [];
        const obj: Record<string, unknown> = {};
        for (const prop of properties) {
          if (prop.type !== 'Property') {
            throw new Error('Object spread / shorthand not allowed');
          }
          const keyNode = asNode(prop.key);
          const valueNode = asNode(prop.value);
          let key: string;
          if (keyNode.type === 'Identifier') {
            key = asStr(keyNode.name);
          } else if (keyNode.type === 'Literal') {
            key = String(keyNode.value);
          } else {
            throw new Error('Unsupported object key type');
          }
          if (VariableResolver.BLOCKED_PROPS.has(key)) {
            throw new Error(`Key not allowed: ${key}`);
          }
          obj[key] = VariableResolver.walkAst(valueNode, ctx);
        }
        return obj;
      }

      case 'ChainExpression':
        // Optional chaining `a?.b` — acorn wraps MemberExpression in this.
        return VariableResolver.walkAst(asNode(node.expression), ctx);

      default:
        throw new Error(`Unsupported expression node: ${node.type}`);
    }
  }

  /**
   * Safe, pure helpers exposed to expressions. All accept primitive inputs and
   * return primitives or plain objects — none expose constructors or prototypes.
   */
  private static buildExpressionHelpers(): Record<string, unknown> {
    return {
      // Math
      abs: Math.abs,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      min: (...args: number[]) => Math.min(...args),
      max: (...args: number[]) => Math.max(...args),
      pow: Math.pow,
      sqrt: Math.sqrt,
      PI: Math.PI,
      E: Math.E,
      random: () => Math.random(),
      // String helpers (tolerate non-string inputs)
      toUpperCase: (s: unknown) => String(s ?? '').toUpperCase(),
      toLowerCase: (s: unknown) => String(s ?? '').toLowerCase(),
      trim: (s: unknown) => String(s ?? '').trim(),
      substring: (s: unknown, start: number, end?: number) =>
        String(s ?? '').substring(start, end),
      replace: (s: unknown, search: string, replacement: string) =>
        String(s ?? '').split(String(search)).join(String(replacement)),
      split: (s: unknown, separator: string) => String(s ?? '').split(String(separator)),
      concat: (...args: unknown[]) => args.map((x) => String(x ?? '')).join(''),
      contains: (s: unknown, sub: string) => String(s ?? '').includes(String(sub)),
      startsWith: (s: unknown, sub: string) => String(s ?? '').startsWith(String(sub)),
      endsWith: (s: unknown, sub: string) => String(s ?? '').endsWith(String(sub)),
      capitalize: (s: unknown) => {
        const str = String(s ?? '');
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
      },
      truncate: (s: unknown, len: number) => {
        const str = String(s ?? '');
        return str.length > len ? str.slice(0, len) + '…' : str;
      },
      pluralize: (word: unknown, count: number) =>
        count === 1 ? String(word ?? '') : String(word ?? '') + 's',
      // Array / object helpers (no lambdas — use path access for filtering upstream)
      length: (val: unknown) => (val as { length?: number })?.length ?? 0,
      first: (arr: unknown) => (Array.isArray(arr) ? arr[0] : undefined),
      last: (arr: unknown) =>
        Array.isArray(arr) && arr.length ? arr[arr.length - 1] : undefined,
      at: (arr: unknown, i: number) => (Array.isArray(arr) ? arr[i] : undefined),
      join: (arr: unknown, separator: string) =>
        Array.isArray(arr) ? arr.join(String(separator ?? ',')) : '',
      count: (arr: unknown) => (Array.isArray(arr) ? arr.length : 0),
      sum: (arr: unknown) =>
        Array.isArray(arr) ? arr.reduce((a: number, b) => a + (Number(b) || 0), 0) : 0,
      // Conversion
      toString: (v: unknown) => String(v ?? ''),
      toNumber: (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      },
      toBoolean: (v: unknown) => {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') {
          const lc = v.trim().toLowerCase();
          return lc === 'true' || lc === '1' || lc === 'yes';
        }
        return Boolean(v);
      },
      // Null safety
      ifNull: (v: unknown, fallback: unknown) =>
        v === null || v === undefined ? fallback : v,
      coalesce: (...args: unknown[]) =>
        args.find((x) => x !== null && x !== undefined) ?? null,
      // JSON (function-based so we don't expose the JSON constructor object)
      jsonStringify: (v: unknown) => {
        try {
          return JSON.stringify(v);
        } catch {
          return '';
        }
      },
      jsonParse: (s: unknown) => {
        try {
          return JSON.parse(String(s ?? ''));
        } catch {
          return null;
        }
      },
      // Date
      now: () => Date.now(),
      today: () => new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Defense-in-depth token filter. expr-eval already prevents runtime access,
   * but blocking `constructor` / `__proto__` / `prototype` stops an attacker
   * from walking any accidentally-exposed object prototype chain to reach a
   * Function constructor.
   */
  private static readonly FORBIDDEN_PATTERNS: RegExp[] = [
    /\bconstructor\b/,
    /\b__proto__\b/,
    /\bprototype\b/,
  ];

  /**
   * Convert a resolved value into a safe inline JS literal for re-injection
   * into an advanced expression that acorn then re-parses.
   *
   * `JSON.stringify` produces correctly-escaped string/number/object/array
   * literals (quotes, backslashes, newlines, tabs, and the U+2028/U+2029 line
   * separators are all handled). Values JSON can't represent (`undefined`,
   * functions, `NaN`, `Infinity`, `BigInt`) are normalised to `null` so the
   * surrounding expression always remains parseable.
   */
  private static toExpressionLiteral(value: unknown): string {
    if (value === undefined || value === null) return 'null';
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : 'null';
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'bigint') return 'null';
    if (typeof value === 'function' || typeof value === 'symbol') return 'null';
    try {
      const json = JSON.stringify(value);
      return json === undefined ? 'null' : json;
    } catch {
      return 'null';
    }
  }

  private static assertSafeExpression(expression: string): void {
    if (typeof expression !== 'string') {
      throw new Error('Expression must be a string');
    }
    if (expression.length > 2000) {
      throw new Error('Expression exceeds maximum length');
    }
    for (const pattern of VariableResolver.FORBIDDEN_PATTERNS) {
      if (pattern.test(expression)) {
        throw new Error(`Expression contains forbidden token: ${pattern.source}`);
      }
    }
  }

  /**
   * Validate expression syntax
   */
  validateExpression(expression: string): { valid: boolean; error?: string } {
    try {
      this.evaluateExpression(expression);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  /**
   * Get available variables for autocomplete
   */
  getAvailableVariables(): Array<{
    key: string;
    label: string;
    type: string;
    value?: unknown;
    category: 'trigger' | 'variables' | 'nodes' | 'system' | 'vars';
  }> {
    const variables: Array<{
      key: string;
      label: string;
      type: string;
      value?: unknown;
      category: 'trigger' | 'variables' | 'nodes' | 'system' | 'vars';
    }> = [];

    // Trigger data variables
    if (this.context.triggerData) {
      for (const [key, value] of Object.entries(this.context.triggerData)) {
        variables.push({
          key: `trigger.${key}`,
          label: `Trigger - ${key}`,
          type: typeof value,
          value,
          category: 'trigger'
        });
      }
    }

    // Workflow variables
    for (const [key, value] of Object.entries(this.context.variables)) {
      variables.push({
        key: `variables.${key}`,
        label: `Variable - ${key}`,
        type: typeof value,
        value,
        category: 'variables'
      });
    }

    // Org/brand-level variables (vars.*)
    for (const [key, value] of Object.entries(this.context.orgVariables ?? {})) {
      variables.push({
        key: `vars.${key}`,
        label: `Org Variable - ${key}`,
        type: typeof value,
        value,
        category: 'vars'
      });
    }

    // Node outputs
    for (const [nodeId, output] of this.context.nodeOutputs.entries()) {
      variables.push({
        key: `$${nodeId}`,
        label: `Node - ${nodeId}`,
        type: typeof output,
        value: output,
        category: 'nodes'
      });
    }

    // System variables
    for (const [key, value] of Object.entries(this.context.systemVariables)) {
      variables.push({
        key: `system.${key}`,
        label: `System - ${key}`,
        type: typeof value,
        value,
        category: 'system'
      });
    }

    return variables;
  }
}

/**
 * Type-safe variable operations
 */
export class VariableTypeConverter {
  /**
   * Convert value to specified type
   */
  static convert(value: unknown, targetType: VariableType): unknown {
    if (value === undefined || value === null) {
      return null;
    }

    switch (targetType) {
      case VariableType.STRING:
        return String(value);

      case VariableType.NUMBER: {
        const num = Number(value);
        return isNaN(num) ? 0 : num;
      }

      case VariableType.BOOLEAN:
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true' || value === '1';
        }
        return Boolean(value);

      case VariableType.DATE: {
        const date = new Date(value as string | number | Date);
        return isNaN(date.getTime()) ? null : date;
      }

      case VariableType.ARRAY:
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return [value];
          }
        }
        return [value];

      case VariableType.OBJECT:
        if (typeof value === 'object') return value;
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return { value };
          }
        }
        return { value };

      case VariableType.ANY:
      default:
        return value;
    }
  }

  /**
   * Validate value against type
   */
  static validate(value: unknown, expectedType: VariableType): boolean {
    if (expectedType === VariableType.ANY) return true;
    if (value === undefined || value === null) return true;

    switch (expectedType) {
      case VariableType.STRING:
        return typeof value === 'string';
      case VariableType.NUMBER:
        return typeof value === 'number' && !isNaN(value);
      case VariableType.BOOLEAN:
        return typeof value === 'boolean';
      case VariableType.DATE:
        return value instanceof Date && !isNaN(value.getTime());
      case VariableType.ARRAY:
        return Array.isArray(value);
      case VariableType.OBJECT:
        return typeof value === 'object' && !Array.isArray(value);
      default:
        return true;
    }
  }
}

/**
 * Build a visible-label → nodeId map for label-based expression refs (2.19).
 *
 * Duplicate labels resolve to the FIRST node encountered and log a warning, so
 * an author who reuses a label still gets deterministic behaviour. Nodes with
 * no label are skipped.
 */
export function buildNodeLabelMap(
  nodes: Array<{ id: string; data?: { label?: string } }>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const node of nodes) {
    const label = node.data?.label?.trim();
    if (!label) continue;
    if (Object.prototype.hasOwnProperty.call(map, label)) {
      console.warn(
        `[variable-resolver] Duplicate node label "${label}" — label-based refs resolve to the first node (${map[label]}), not ${node.id}.`
      );
      continue;
    }
    map[label] = node.id;
  }
  return map;
}

/**
 * Export convenience function
 */
export function createVariableResolver(context: ExecutionContext): VariableResolver {
  return new VariableResolver(context);
}
