import { NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { generateTextWithClient } from '@/ai/client';

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { nodes, edges: _edges, targetNodeId } = await req.json();

        if (!nodes || !targetNodeId) {
            return new NextResponse('Missing required parameters', { status: 400 });
        }

        type WorkflowNode = { id: string; type?: string; data?: Record<string, unknown> };
        const targetNode = (nodes as WorkflowNode[]).find((n) => n.id === targetNodeId);
        if (!targetNode) {
            return new NextResponse('Target node not found', { status: 404 });
        }

        // Build a summary of the workflow context leading up to this node
        const precedingNodesContext = (nodes as WorkflowNode[]).map((n) => ({
            id: n.id,
            type: n.type,
            subType: n.data?.subType,
            data: n.data
        }));

        const systemPrompt = `You are MontrAI's Workflow Magic Fill assistant. Your job is to suggest missing configuration properties for a specific workflow node based on the context of the entire workflow.
Your output MUST be a JSON object containing the suggested properties for the node's 'data' object. DO NOT wrap the output in markdown code blocks. Output raw JSON only.

Example output:
{
  "subject": "Welcome to MontrAI {{$trigger.contact.firstName}}",
  "body": "Hi there, thanks for joining!"
}`;

        const userPrompt = `Workflow Context:
${JSON.stringify(precedingNodesContext, null, 2)}

Target Node Detail:
Type: ${targetNode.type}
SubType: ${targetNode.data?.subType || 'N/A'}
Current Data: ${JSON.stringify(targetNode.data, null, 2)}

Suggest realistic, highly effective configuration properties for this target node. Output ONLY raw JSON.`;

        const text = await generateTextWithClient({
            model: 'openai/gpt-4o-mini',
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });

        // Attempt to parse the JSON
        let suggestedData = {};
        try {
            // Strip potential markdown backticks
            const cleanedText = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
            suggestedData = JSON.parse(cleanedText);
        } catch (_e) {
            console.error('Failed to parse Magic Fill AI response as JSON:', text);
            return new NextResponse('AI returned invalid JSON', { status: 500 });
        }

        return NextResponse.json({ suggestion: suggestedData });

    } catch (error) {
        console.error('Error in Magic Fill Route:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
