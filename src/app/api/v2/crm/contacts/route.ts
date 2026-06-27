import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { createContactSchema } from '@/validations/crm/contact.schema';
import { emitContactCreated } from '@/lib/crm';
import { findDuplicatesForCandidate } from '@/lib/crm/dedupe';
import { parseFilterTreeParam } from '@/lib/crm/parse-filter-tree-param';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * GET /api/v2/crm/contacts
 * List contacts with pagination, filtering, search, and sorting
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    // RBAC: read contacts (own-scope adds an owner filter below).
    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'contact', 'read');

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const search = searchParams.get('search') || undefined;
    const sortParam = searchParams.get('sort') || '-createdAt';

    // Determine sort field and direction
    const sortDirection = sortParam.startsWith('-') ? 'desc' : 'asc';
    const sort = sortParam.startsWith('-') ? sortParam.substring(1) : sortParam;

    // Parse filters
    const filters: Record<string, unknown> = {};

    if (search) {
      filters.search = search;
    }

    const status = searchParams.get('status');
    if (status) {
      // Support comma-separated statuses
      filters.status = status.includes(',') ? status.split(',') : status;
    }

    const lifecycle = searchParams.get('lifecycle');
    if (lifecycle) {
      filters.lifecycle = lifecycle;
    }

    const rating = searchParams.get('rating');
    if (rating) {
      filters.rating = rating;
    }

    const ownerId = searchParams.get('ownerId');
    if (ownerId) {
      filters.ownerId = ownerId;
    }

    // Own-scope read: restrict to records owned by the current user.
    if (scope === 'own') {
      filters.ownerId = userId;
    }

    const companyId = searchParams.get('companyId');
    if (companyId) {
      filters.companyId = companyId;
    }

    const tags = searchParams.get('tags');
    if (tags) {
      filters.tags = tags.split(',');
    }

    const source = searchParams.get('source');
    if (source) {
      filters.source = source;
    }

    const createdAfter = searchParams.get('createdAfter');
    if (createdAfter) {
      filters.createdAfter = new Date(createdAfter);
    }

    const createdBefore = searchParams.get('createdBefore');
    if (createdBefore) {
      filters.createdBefore = new Date(createdBefore);
    }

    // Nested view filter tree (saved-view AND/OR groups). Validated + sanitized;
    // org scope is applied by the repository OUTSIDE this tree and cannot be
    // overridden here.
    const filterTreeMongo = parseFilterTreeParam(
      searchParams.get('filterTree'),
      'contact',
    );
    if (filterTreeMongo) {
      filters.filterTreeMongo = filterTreeMongo;
    }

    // Fetch contacts with pagination
    const result = await contactRepository.find(filters, {
      page,
      limit,
      sort,
      sortDirection,
    });

    return NextResponse.json(result);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching contacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/contacts
 * Create a new contact
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    // RBAC: create contacts.
    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'create');

    const body = await request.json();

    // Check plan limit BEFORE creating contact
    const { checkPlanLimit } = await import('@/lib/plan-enforcement');
    const canCreate = await checkPlanLimit(userId, 'contacts', 'maxContacts');

    if (!canCreate.allowed) {
      return NextResponse.json({
        error: 'Plan limit reached',
        message: canCreate.message,
        current: canCreate.current,
        limit: canCreate.limit,
        upgradeRequired: true
      }, { status: 403 });
    }

    // Validate input
    const validatedData = createContactSchema.parse(body);

    // Declarative duplicate-detection (dedupe rules) — soft 409 unless forced.
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true' || body?.ignoreDuplicates === true;
    if (!force) {
      const duplicates = await findDuplicatesForCandidate(
        'contact',
        validatedData as Record<string, unknown>
      );
      if (duplicates.length > 0) {
        return NextResponse.json(
          { error: 'duplicate_suspected', duplicates },
          { status: 409 }
        );
      }
    }

    // Check for duplicate email if provided
    if (validatedData.email) {
      const existing = await contactRepository.findByEmail(
        validatedData.email
      );
      if (existing) {
        return NextResponse.json(
          { error: 'Contact with this email already exists' },
          { status: 400 }
        );
      }
    }

    // Create contact
    const contact = await contactRepository.create({
      ...validatedData,
      createdById: userId,
    });

    await emitContactCreated(contact, userId);

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating contact:', error);
    return NextResponse.json(
      { error: 'Failed to create contact', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
