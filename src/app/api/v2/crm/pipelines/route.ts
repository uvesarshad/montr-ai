import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';
import { createPipelineSchema } from '@/validations/crm/pipeline.schema';
import { z } from 'zod';

/**
 * GET /api/v2/crm/pipelines
 * List all pipelines for the organization
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
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const includeInactive = searchParams.get('includeInactive') === 'true';

    // Fetch all pipelines
    const pipelines = await pipelineRepository.findAll(includeInactive);

    return NextResponse.json({
      data: pipelines,
      total: pipelines.length,
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching pipelines:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pipelines', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/pipelines
 * Create a new pipeline
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
    assertCanManageSettings(ctx);
    const body = await request.json();

    // Validate input
    const validatedData = createPipelineSchema.parse(body);

    // Create pipeline
    const pipeline = await pipelineRepository.create({
      ...validatedData,
      createdById: userId,
    });

    return NextResponse.json(pipeline, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating pipeline:', error);
    return NextResponse.json(
      { error: 'Failed to create pipeline', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
