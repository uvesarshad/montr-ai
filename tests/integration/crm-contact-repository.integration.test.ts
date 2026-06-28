/**
 * CRM ContactRepository CRUD round-trip vs REAL Mongo (single-node rs0).
 *
 * Exercises the actual repository (no mocks): create -> findById -> update ->
 * find (paginated) -> softDelete, and proves org-scoping — a contact created in
 * org A is invisible to reads scoped to org B.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';

import { contactRepository } from '@/lib/db/repository/crm/contact.repository';

const ORG_A = new Types.ObjectId().toString();
const ORG_B = new Types.ObjectId().toString();
const CREATOR = new Types.ObjectId().toString();

let mongoose: typeof import('mongoose').default;

beforeAll(async () => {
    mongoose = (await import('mongoose')).default;
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
    // Clean slate for this collection.
    await mongoose.connection.collection('crm_contacts').deleteMany({});
});

afterAll(async () => {
    await mongoose.connection.collection('crm_contacts').deleteMany({});
    await mongoose.connection.close();
});

describe('ContactRepository (real Mongo)', () => {
    it('round-trips create -> read -> update -> soft delete', async () => {
        const created = await contactRepository.create({
            organizationId: ORG_A,
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            createdById: CREATOR,
        });
        expect(created._id).toBeDefined();
        expect(created.organizationId.toString()).toBe(ORG_A);

        const id = created._id.toString();

        // Read back, org-scoped.
        const fetched = await contactRepository.findById(id, ORG_A);
        expect(fetched).not.toBeNull();
        expect(fetched!.firstName).toBe('Ada');

        // findByEmail hits the scalar/multi-value $or path.
        const byEmail = await contactRepository.findByEmail('ada@example.com', ORG_A);
        expect(byEmail?._id.toString()).toBe(id);

        // Update.
        const updated = await contactRepository.update(id, ORG_A, { jobTitle: 'Engineer' });
        expect(updated?.jobTitle).toBe('Engineer');

        // Soft delete removes it from default reads but keeps the row.
        const deleted = await contactRepository.softDelete(id, ORG_A, CREATOR);
        expect(deleted).toBe(true);
        expect(await contactRepository.findById(id, ORG_A)).toBeNull();
        expect(await contactRepository.findByIdIncludingDeleted(id, ORG_A)).not.toBeNull();
    });

    it('scopes reads by organizationId (no cross-tenant leakage)', async () => {
        const a = await contactRepository.create({
            organizationId: ORG_A,
            firstName: 'Org-A',
            email: 'a-only@example.com',
            createdById: CREATOR,
        });
        await contactRepository.create({
            organizationId: ORG_B,
            firstName: 'Org-B',
            email: 'b-only@example.com',
            createdById: CREATOR,
        });

        // Org A's contact must not be reachable from org B.
        expect(await contactRepository.findById(a._id.toString(), ORG_B)).toBeNull();

        const listA = await contactRepository.find(ORG_A, {}, { limit: 100 });
        const orgIds = new Set(listA.data.map((c) => c.organizationId.toString()));
        expect(orgIds.has(ORG_B)).toBe(false);
        expect(orgIds.has(ORG_A)).toBe(true);

        const countB = await contactRepository.countByOrganization(ORG_B);
        expect(countB).toBe(1);
    });
});
