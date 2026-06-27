import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { dealRepository, CreateDealDto, type DealFilters } from '@/lib/db/repository/crm/deal.repository';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';
import { createDealSchema } from '@/validations/crm/deal.schema';
import type { IDealRichNotes } from '@/lib/db/models/crm/deal.model';
import { emitDealCreated } from '@/lib/crm';
import { findDuplicatesForCandidate } from '@/lib/crm/dedupe';
import { parseFilterTreeParam } from '@/lib/crm/parse-filter-tree-param';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * GET /api/v2/crm/deals
 * List deals with pagination, filtering, search, and sorting
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
    const { scope } = assertCrmPermission(ctx, 'deal', 'read');

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
    const filters: DealFilters = {};

    if (search) {
      filters.search = search;
    }

    const status = searchParams.get('status');
    if (status) {
      filters.status = (status.includes(',') ? status.split(',') : status) as DealFilters['status'];
    }

    const priority = searchParams.get('priority');
    if (priority) {
      filters.priority = priority as DealFilters['priority'];
    }

    const pipelineId = searchParams.get('pipelineId');
    if (pipelineId) {
      filters.pipelineId = pipelineId;
    }

    const stageId = searchParams.get('stageId');
    if (stageId) {
      filters.stageId = stageId;
    }

    const ownerId = searchParams.get('ownerId');
    if (ownerId) {
      filters.ownerId = ownerId;
    }

    if (scope === 'own') {
      filters.ownerId = userId;
    }

    const contactId = searchParams.get('contactId');
    if (contactId) {
      filters.contactId = contactId;
    }

    const companyId = searchParams.get('companyId');
    if (companyId) {
      filters.companyId = companyId;
    }

    const tags = searchParams.get('tags');
    if (tags) {
      filters.tags = tags.split(',');
    }

    const minValue = searchParams.get('minValue');
    if (minValue) {
      filters.minValue = parseFloat(minValue);
    }

    const maxValue = searchParams.get('maxValue');
    if (maxValue) {
      filters.maxValue = parseFloat(maxValue);
    }

    // Accept both legacy (closeDateFrom/To) and explicit (expectedCloseAfter/Before) param names.
    const closeDateFrom = searchParams.get('closeDateFrom') || searchParams.get('expectedCloseAfter');
    if (closeDateFrom) {
      const d = new Date(closeDateFrom);
      if (!isNaN(d.getTime())) filters.expectedCloseAfter = d;
    }

    const closeDateTo = searchParams.get('closeDateTo') || searchParams.get('expectedCloseBefore');
    if (closeDateTo) {
      const d = new Date(closeDateTo);
      if (!isNaN(d.getTime())) filters.expectedCloseBefore = d;
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
      'deal',
    );
    if (filterTreeMongo) {
      filters.filterTreeMongo = filterTreeMongo;
    }

    // Fetch deals with pagination
    const result = await dealRepository.find(filters, {
      page,
      limit,
      sort,
      sortDirection,
    });

    return NextResponse.json(result);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching deals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deals', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/deals
 * Create a new deal
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
    assertCrmPermission(ctx, 'deal', 'create');

    const body = await request.json();

    // Validate input
    const validatedData = createDealSchema.parse(body);

    // Declarative duplicate-detection (dedupe rules) — soft 409 unless forced.
    // Deal dedupe is OFF by default; only fires if the org configures rules.
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true' || body?.ignoreDuplicates === true;
    if (!force) {
      const duplicates = await findDuplicatesForCandidate(
        'deal',
        validatedData as Record<string, unknown>
      );
      if (duplicates.length > 0) {
        return NextResponse.json(
          { error: 'duplicate_suspected', duplicates },
          { status: 409 }
        );
      }
    }

    // Verify pipeline exists
    const pipeline = await pipelineRepository.findById(
      validatedData.pipelineId
    );
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // If no stageId provided, use first stage of pipeline
    let stageId = validatedData.stageId;
    let stageName = '';

    if (!stageId) {
      if (pipeline.stages.length === 0) {
        return NextResponse.json(
          { error: 'Pipeline has no stages' },
          { status: 400 }
        );
      }
      const firstStage = pipeline.stages[0];
      stageId = firstStage._id.toString();
      stageName = firstStage.name;
    } else {
      // Verify stage exists in pipeline
      const stage = pipeline.stages.find(s => s._id.toString() === stageId);
      if (!stage) {
        return NextResponse.json(
          { error: 'Stage not found in pipeline' },
          { status: 404 }
        );
      }
      stageName = stage.name;
    }

    // Create deal
    const dealData: CreateDealDto = {
      name: validatedData.name,
      description: validatedData.description,
      contactId: validatedData.contactId,
      companyId: validatedData.companyId,
      pipelineId: validatedData.pipelineId,
      stageId,
      value: validatedData.value,
      currency: validatedData.currency,
      probability: validatedData.probability,
      expectedCloseDate: validatedData.expectedCloseDate,
      status: validatedData.status,
      priority: validatedData.priority,
      source: validatedData.source,
      tags: validatedData.tags,
      customFields: validatedData.customFields,
      ownerId: validatedData.ownerId,
      notes: validatedData.notes as unknown as IDealRichNotes | undefined,
      createdById: userId,
    };

    const deal = await dealRepository.create(dealData);

    // Update stage history with stage name
    if (deal.stageHistory.length > 0) {
      deal.stageHistory[0].stageName = stageName;
      await deal.save();
    }

    await emitDealCreated(deal, userId);

    return NextResponse.json(deal, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating deal:', error);
    return NextResponse.json(
      { error: 'Failed to create deal', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
