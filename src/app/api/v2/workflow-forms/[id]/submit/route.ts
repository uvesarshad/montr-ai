import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { workflowFormRequestRepository } from '@/lib/db/repository/workflow-form-request.repository';
import { submitWorkflowFormSchema } from '@/validations/workflow-form';
import { resumePausedExecutionsForEvent } from '@/lib/workflow/triggers/event-resumer';
import type { IFormField } from '@/lib/db/models/workflow-form-request.model';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Validate + coerce a raw value against a field def. Throws on bad input. */
function coerceValue(field: IFormField, raw: unknown): unknown {
  const isEmpty = raw === undefined || raw === null || raw === '';
  if (isEmpty) {
    if (field.required) {
      throw new Error(`Field "${field.label}" is required`);
    }
    return field.type === 'checkbox' ? false : undefined;
  }
  switch (field.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(n)) throw new Error(`Field "${field.label}" must be a number`);
      return n;
    }
    case 'checkbox':
      return raw === true || raw === 'true' || raw === 'on' || raw === 1;
    case 'select': {
      const s = String(raw);
      if (field.options && field.options.length > 0 && !field.options.includes(s)) {
        throw new Error(`Field "${field.label}" must be one of: ${field.options.join(', ')}`);
      }
      return s;
    }
    case 'date':
    case 'text':
    case 'textarea':
    default:
      return String(raw);
  }
}

/**
 * POST /api/v2/workflow-forms/[id]/submit
 * Validate the submitted values against the field defs, persist them, and
 * resume the paused workflow execution waiting on this form.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await userRepository.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const { id } = await ctx.params;

    const form = await workflowFormRequestRepository.findById(id);
    if (!form) {
      return NextResponse.json({ error: 'Form request not found' }, { status: 404 });
    }
    const role = (session.user as { role?: string }).role;
    const isAdmin = role === 'admin' || role === 'super_admin';
    if (String(form.assigneeId) !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (form.status !== 'pending') {
      return NextResponse.json({ error: `Form is already ${form.status}` }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = submitWorkflowFormSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    // Validate + coerce against the stored field defs.
    const coerced: Record<string, unknown> = {};
    try {
      for (const field of form.fields) {
        const v = coerceValue(field, parsed.data.values[field.key]);
        if (v !== undefined) coerced[field.key] = v;
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Validation failed' },
        { status: 400 },
      );
    }

    const updated = await workflowFormRequestRepository.submit(id, coerced, session.user.id);
    if (!updated) {
      return NextResponse.json({ error: 'Form could not be submitted (already resolved?)' }, { status: 409 });
    }

    // Resume the parked execution — values land in the wait node's output.
    const report = await resumePausedExecutionsForEvent({
      kind: 'form_submitted',
      key: id,
      payload: { values: coerced, formRequestId: id },
    });

    return NextResponse.json({ success: true, resumed: report.resumed, matched: report.matched });
  } catch (error) {
    console.error('[workflow-forms] submit error:', error);
    return NextResponse.json({ error: 'Failed to submit form' }, { status: 500 });
  }
}
