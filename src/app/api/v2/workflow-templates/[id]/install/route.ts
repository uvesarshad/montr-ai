/**
 * Install Workflow Template API
 */

import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { WorkflowTemplate, ITemplateParameter } from '@/lib/db/models/workflow-template.model';
import { UnifiedWorkflow } from '@/lib/db/models/unified-workflow.model';

/**
 * POST /api/v2/workflow-templates/[id]/install
 * Install a template as a new workflow
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    await connectDB();

    // Get template
    const template = await WorkflowTemplate.findById(params.id);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const body = await request.json();
    const parameters = body.parameters || {};

    // Validate required parameters
    const missingParams = template.parameters?.filter(
      (param: ITemplateParameter) => param.required && !parameters[param.key]
    );

    if (missingParams && missingParams.length > 0) {
      return NextResponse.json(
        {
          error: 'Missing required parameters',
          missing: missingParams.map((p: ITemplateParameter) => p.key),
        },
        { status: 400 }
      );
    }

    // Replace placeholders in workflow with parameter values
    let workflowData = {
      nodes: JSON.parse(JSON.stringify(template.nodes)),
      edges: JSON.parse(JSON.stringify(template.edges)),
      variables: template.variables || [],
    };

    // Simple placeholder replacement (can be enhanced)
    const dataStr = JSON.stringify(workflowData);
    let replacedStr = dataStr;

    Object.entries(parameters).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      replacedStr = replacedStr.split(placeholder).join(String(value));
    });

    workflowData = JSON.parse(replacedStr);

    // Create new workflow from template
    const workflow = await UnifiedWorkflow.create({
      createdById: userId,
      name: `${template.name} (Copy)`,
      description: template.description,
      type: template.workflowType,
      status: 'draft',
      trigger: template.trigger,
      nodes: workflowData.nodes,
      edges: workflowData.edges,
      variables: workflowData.variables,
      sourceTemplateId: template._id,
    });

    // Increment template install count
    await WorkflowTemplate.findByIdAndUpdate(params.id, {
      $inc: { 'stats.installs': 1 },
    });

    return NextResponse.json({
      success: true,
      workflow: {
        _id: workflow._id.toString(),
        name: workflow.name,
        type: workflow.type,
        status: workflow.status,
      },
    });
  } catch (error) {
    console.error('Error installing template:', error);
    return NextResponse.json(
      { error: 'Failed to install template', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
