import { NextRequest, NextResponse } from 'next/server';
import { WORKFLOW_TEMPLATES } from '@/lib/whatsapp/automation/templates';

export async function GET(_req: NextRequest) {
    return NextResponse.json({ templates: WORKFLOW_TEMPLATES });
}
