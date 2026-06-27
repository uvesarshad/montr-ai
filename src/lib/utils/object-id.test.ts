import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { toIdString, idsEqual, toObjectId } from './object-id';

const HEX = '507f1f77bcf86cd799439011';

describe('toIdString', () => {
    it('returns a plain string id unchanged', () => {
        expect(toIdString(HEX)).toBe(HEX);
        expect(toIdString('firebase-uid-abc')).toBe('firebase-uid-abc');
    });

    it('stringifies an ObjectId', () => {
        expect(toIdString(new Types.ObjectId(HEX))).toBe(HEX);
    });

    it('unwraps a populated { _id } document', () => {
        const doc = { _id: new Types.ObjectId(HEX), name: 'Acme' };
        expect(toIdString(doc)).toBe(HEX);
    });

    it('unwraps a populated doc whose _id is a string', () => {
        expect(toIdString({ _id: HEX })).toBe(HEX);
    });

    it('returns null for null / undefined / empty string', () => {
        expect(toIdString(null)).toBeNull();
        expect(toIdString(undefined)).toBeNull();
        expect(toIdString('')).toBeNull();
    });

    it('returns null for a plain object with no id', () => {
        expect(toIdString({ name: 'no id here' })).toBeNull();
    });

    it('handles numbers', () => {
        expect(toIdString(42)).toBe('42');
    });
});

describe('idsEqual', () => {
    it('treats string and ObjectId forms of the same id as equal', () => {
        expect(idsEqual(HEX, new Types.ObjectId(HEX))).toBe(true);
        expect(idsEqual(new Types.ObjectId(HEX), HEX)).toBe(true);
    });

    it('treats a populated doc and a bare id as equal', () => {
        expect(idsEqual({ _id: new Types.ObjectId(HEX) }, HEX)).toBe(true);
    });

    it('returns false for different ids', () => {
        expect(idsEqual(HEX, '507f1f77bcf86cd799439012')).toBe(false);
    });

    it('returns false when either side is null/absent', () => {
        expect(idsEqual(null, null)).toBe(false);
        expect(idsEqual(HEX, null)).toBe(false);
        expect(idsEqual(undefined, HEX)).toBe(false);
        expect(idsEqual('', '')).toBe(false);
    });
});

describe('toObjectId', () => {
    it('passes an existing ObjectId through', () => {
        const oid = new Types.ObjectId(HEX);
        expect(toObjectId(oid)).toBe(oid);
    });

    it('parses a hex string into an ObjectId', () => {
        const out = toObjectId(HEX);
        expect(out).toBeInstanceOf(Types.ObjectId);
        expect(out?.toString()).toBe(HEX);
    });

    it('unwraps a populated { _id } doc without throwing', () => {
        const out = toObjectId({ _id: new Types.ObjectId(HEX) });
        expect(out?.toString()).toBe(HEX);
    });

    it('returns null for null / invalid id instead of throwing', () => {
        expect(toObjectId(null)).toBeNull();
        expect(toObjectId(undefined)).toBeNull();
        expect(toObjectId('not-an-object-id')).toBeNull();
        expect(toObjectId({ name: 'no id' })).toBeNull();
    });
});
