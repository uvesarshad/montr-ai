/**
 * API-route handler test for `GET /api/v2/crm/contacts` against REAL Mongo.
 *
 * The auth/session + RBAC layers are mocked (they are NOT what we're testing),
 * but the org-pinning path is exercised for real: the route resolves the org
 * from the DB user record via the real `userRepository`, then the real
 * `contactRepository` queries real Mongo. We seed contacts in two orgs and a
 * user belonging to org A, and assert the handler returns ONLY org-A contacts —
 * i.e. a client can never read another tenant's data.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

// Mutable session holder so we can set the resolved user id after seeding.
const sessionState = vi.hoisted(() => ({ userId: '' }));

vi.mock('@/lib/get-session', () => ({
    getSession: vi.fn(async () => ({
        user: { id: sessionState.userId, role: 'admin', email: 'owner@example.com' },
    })),
}));

// RBAC: grant full access; we're testing data scoping, not permission logic.
vi.mock('@/lib/crm/permissions', () => ({
    getCrmPermissionContext: vi.fn(async () => ({
        userId: sessionState.userId,
        organizationId: '',
        isPlatformAdmin: true,
        role: null,
    })),
    assertCrmPermission: vi.fn(() => ({ scope: 'all' })),
    crmErrorResponse: vi.fn(() => null),
}));

// The CRM barrel pulls the event bus (Redis) at import; stub the emit used by POST.
vi.mock('@/lib/crm', () => ({
    emitContactCreated: vi.fn(async () => {}),
}));

const ORG_A = new Types.ObjectId().toString();
const ORG_B = new Types.ObjectId().toString();

let mongoose: typeof import('mongoose').default;
let GET: (req: unknown) => Promise<Response>;

beforeAll(async () => {
    mongoose = (await import('mongoose')).default;
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();

    await mongoose.connection.collection('crm_contacts').deleteMany({});
    await mongoose.connection.collection('users').deleteMany({ email: 'owner@example.com' });

    // Seed a real user that belongs to ORG_A.
    const { userRepository } = await import('@/lib/db/repository/user.repository');
    const user = await userRepository.create({ name: 'Owner', email: 'owner@example.com' });
    await mongoose.connection
        .collection('users')
        .updateOne({ _id: user._id }, { $set: { organizationId: ORG_A } });
    sessionState.userId = user._id.toString();

    // Seed contacts in both orgs.
    const { contactRepository } = await import('@/lib/db/repository/crm/contact.repository');
    await contactRepository.create({
        organizationId: ORG_A,
        firstName: 'Visible-A',
        email: 'visible-a@example.com',
        createdById: sessionState.userId,
    });
    await contactRepository.create({
        organizationId: ORG_B,
        firstName: 'Hidden-B',
        email: 'hidden-b@example.com',
        createdById: sessionState.userId,
    });

    ({ GET } = await import('@/app/api/v2/crm/contacts/route'));
});

afterAll(async () => {
    await mongoose.connection.collection('crm_contacts').deleteMany({});
    await mongoose.connection.collection('users').deleteMany({ email: 'owner@example.com' });
    await mongoose.connection.close();
});

describe('GET /api/v2/crm/contacts (real Mongo, org-pinned)', () => {
    it('returns only contacts for the session user\'s organization', async () => {
        const { NextRequest } = await import('next/server');
        const req = new NextRequest('http://localhost/api/v2/crm/contacts?limit=100');

        const res = await GET(req);
        expect(res.status).toBe(200);

        const body = (await res.json()) as {
            data: Array<{ firstName: string; organizationId: string }>;
            pagination: { total: number };
        };

        const orgs = new Set(body.data.map((c) => c.organizationId.toString()));
        expect(orgs.has(ORG_A)).toBe(true);
        expect(orgs.has(ORG_B)).toBe(false);

        const names = body.data.map((c) => c.firstName);
        expect(names).toContain('Visible-A');
        expect(names).not.toContain('Hidden-B');
    });

    it('401s when there is no session', async () => {
        const getSession = (await import('@/lib/get-session')).getSession as unknown as {
            mockResolvedValueOnce: (v: unknown) => void;
        };
        getSession.mockResolvedValueOnce(null);

        const { NextRequest } = await import('next/server');
        const res = await GET(new NextRequest('http://localhost/api/v2/crm/contacts'));
        expect(res.status).toBe(401);
    });
});
