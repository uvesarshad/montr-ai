import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { createCompanySchema } from '@/validations/crm/company.schema';
import { emitCompanyCreated } from '@/lib/crm';
import { findDuplicatesForCandidate } from '@/lib/crm/dedupe';
import { parseFilterTreeParam } from '@/lib/crm/parse-filter-tree-param';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * GET /api/v2/crm/companies
 * List companies with pagination, filtering, search, and sorting
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
    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'company', 'read');

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

    const type = searchParams.get('type');
    if (type) {
      // Support comma-separated types
      filters.type = type.includes(',') ? type.split(',') : type;
    }

    const industry = searchParams.get('industry');
    if (industry) {
      filters.industry = industry;
    }

    const size = searchParams.get('size');
    if (size) {
      filters.size = size;
    }

    const ownerId = searchParams.get('ownerId');
    if (ownerId) {
      filters.ownerId = ownerId;
    }

    if (scope === 'own') {
      filters.ownerId = userId;
    }

    const tags = searchParams.get('tags');
    if (tags) {
      filters.tags = tags.split(',');
    }

    const createdAfter = searchParams.get('createdAfter');
    if (createdAfter) {
      filters.createdAfter = new Date(createdAfter);
    }

    const createdBefore = searchParams.get('createdBefore');
    if (createdBefore) {
      filters.createdBefore = new Date(createdBefore);
    }

    const filterTreeMongo = parseFilterTreeParam(
      searchParams.get('filterTree'),
      'company',
    );
    if (filterTreeMongo) {
      filters.filterTreeMongo = filterTreeMongo;
    }

    // Fetch companies with pagination
    const result = await companyRepository.find(filters, {
      page,
      limit,
      sort,
      sortDirection,
    });

    return NextResponse.json(result);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching companies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch companies', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/companies
 * Create a new company
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
    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'company', 'create');

    const body = await request.json();

    // Validate input
    const validatedData = createCompanySchema.parse(body);

    // Declarative duplicate-detection (dedupe rules) — soft 409 unless forced.
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true' || body?.ignoreDuplicates === true;
    if (!force) {
      const duplicates = await findDuplicatesForCandidate(
        'company',
        validatedData as Record<string, unknown>
      );
      if (duplicates.length > 0) {
        return NextResponse.json(
          { error: 'duplicate_suspected', duplicates },
          { status: 409 }
        );
      }
    }

    // Check for duplicate domain if provided
    if (validatedData.domain) {
      const existing = await companyRepository.findByDomain(
        validatedData.domain
      );
      if (existing) {
        return NextResponse.json(
          { error: 'Company with this domain already exists' },
          { status: 400 }
        );
      }
    }

    // Create company
    const company = await companyRepository.create({
      ...validatedData,
      createdById: userId,
    });

    await emitCompanyCreated(company, userId);

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating company:', error);
    return NextResponse.json(
      { error: 'Failed to create company', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
