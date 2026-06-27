/**
 * Shared id-normalization helpers for MongoDB / Mongoose id seams.
 *
 * MontrAI's subsystems disagree on how ids are stored and passed:
 *   - Canvas / Brand / ScheduledPost / WhatsApp use **string** `userId`,
 *     `organizationId`, `brandId` (stringified ObjectIds).
 *   - CRM / UnifiedWorkflow / ApprovalRequest use real **ObjectId** refs.
 *   - Strategy stores `orgId` / `brandId` as **Mixed** (`ObjectId | string`).
 *
 * When ids cross those boundaries (e.g. the central approval queue is fed by
 * both string-id and ObjectId-id producers, or a permission check compares an
 * ObjectId field against a session string) a raw `===` is silently always-false
 * and a bare `new Types.ObjectId(String(x))` throws on a populated `{ _id }`
 * document. These helpers normalize all the shapes we actually pass around —
 * `string`, `ObjectId`, a populated `{ _id }` doc, anything with `toString()`,
 * or null/undefined — to one canonical form.
 */

import { Types } from 'mongoose';

/** Anything we might receive at an id boundary. */
export type IdLike =
    | string
    | number
    | Types.ObjectId
    | { _id?: unknown; toString?: () => string }
    | null
    | undefined;

/**
 * Normalize any id-shaped value to its canonical hex/string form, or `null`
 * when there's no usable id. Unwraps populated `{ _id }` documents.
 */
export function toIdString(value: IdLike): string | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') return value.length > 0 ? value : null;
    if (typeof value === 'number') return String(value);
    if (value instanceof Types.ObjectId) return value.toString();

    if (typeof value === 'object') {
        const obj = value as { _id?: unknown; toString?: () => string };
        // Populated document: unwrap its _id (guard against self-reference).
        if (obj._id !== undefined && obj._id !== null && obj._id !== value) {
            return toIdString(obj._id as IdLike);
        }
        // Buffer/ObjectId-like with a meaningful toString().
        if (typeof obj.toString === 'function') {
            const s = obj.toString();
            if (typeof s === 'string' && s.length > 0 && s !== '[object Object]') {
                return s;
            }
        }
        return null;
    }

    return null;
}

/**
 * Compare two ids for equality regardless of representation (string vs
 * ObjectId vs populated doc). Two null/empty ids are NOT equal — an absent id
 * never matches another absent id (avoids treating "no owner" as "same owner").
 */
export function idsEqual(a: IdLike, b: IdLike): boolean {
    const sa = toIdString(a);
    const sb = toIdString(b);
    return sa !== null && sb !== null && sa === sb;
}

/**
 * Coerce any id-shaped value into a Mongoose `ObjectId`, or `null` when the
 * value is absent or not a valid ObjectId. Unlike `new Types.ObjectId(String(x))`
 * this never throws on a populated `{ _id }` doc, an existing ObjectId, or
 * nullish input.
 */
export function toObjectId(value: IdLike): Types.ObjectId | null {
    if (value instanceof Types.ObjectId) return value;
    const s = toIdString(value);
    if (s === null || !Types.ObjectId.isValid(s)) return null;
    return new Types.ObjectId(s);
}
