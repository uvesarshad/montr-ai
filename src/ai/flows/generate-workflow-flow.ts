'use server';

/**
 * @deprecated This Genkit flow is superseded by /api/v2/ai-workflow/generate
 * which uses a 3-step agent (describe → convert → validate) with SSE streaming.
 * Kept for backward compatibility with any direct callers.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateWorkflowInputSchema = z.object({
    prompt: z.string().describe('The prompt to generate a workflow from.'),
});

export type GenerateWorkflowInput = z.infer<typeof GenerateWorkflowInputSchema>;

const ProcessedNodeSchema = z.object({
    id: z.string(),
    type: z.string(),
    data: z.record(z.any()),
    position: z.object({
        x: z.number(),
        y: z.number(),
    }),
});

const ProcessedEdgeSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    type: z.string().optional(),
    animated: z.boolean().optional(),
});

const GenerateWorkflowOutputSchema = z.object({
    nodes: z.array(ProcessedNodeSchema),
    edges: z.array(ProcessedEdgeSchema),
});

export type GenerateWorkflowOutput = z.infer<typeof GenerateWorkflowOutputSchema>;

// Define the prompt using existing Genkit patterns
const generateWorkflowPrompt = ai.definePrompt({
    name: 'generateWorkflowPrompt',
    input: { schema: GenerateWorkflowInputSchema },
    output: { schema: GenerateWorkflowOutputSchema }, // Use the output schema directly
    prompt: `You are an AI assistant that generates automation workflows for a marketing platform based on user requests.

  Based on the user's prompt: "{{prompt}}"

  Generate a JSON structure representing a React Flow compatible workflow.
  
  Supported Node Types & Configuration:
  - 'triggerManual': Manual trigger button. Data: { label: 'Start' }
  - 'triggerSchedule': Runs on a schedule. Data: { cron: '0 9 * * *' } 
  - 'triggerWebhook': Triggers via HTTP. Data: { method: 'POST' }
  
  - 'actionWhatsApp': Sends WhatsApp message. Data: { message: 'Hello world', recipientField: '{{contact.phone}}' }
  - 'actionMarketingEmail': Sends email via campaign. Data: { subject: 'Welcome', content: 'Hi there...' }
  - 'actionConversationalEmail': Personal email. Data: { subject: 'Re: Inquiry', body: '...' }
  
  - 'logicDelay': Waits for time. Data: { delayMs: 5000, label: 'Wait 5s' }
  - 'logicBranch': Conditional logic.
  
  - 'aiChatbot': AI conversational agent. Data: { systemPrompt: 'You are helpful...' }
  - 'generateImage': AI image generator. Data: { systemPrompt: 'A futuristic city' }
  - 'generateVideo': AI video generator.
  
  - 'textInput': A simple note. Data: { label: 'Note' }
  - 'imageNode': Display an image. Data: { url: '...' }

  Output Format:
  - 'nodes': Array of objects with 'id', 'type', 'position' ({x, y}), and 'data'.
  - 'edges': Array of objects connecting nodes (source -> target).
  
  Layout Rules:
  - Start at x: 100, y: 100.
  - Space subsequent nodes horizontally by +400px.
  - Branching paths should diverge vertically.
  
  Return ONLY the JSON object with "nodes" and "edges".`,
});

const generateWorkflowFlow = ai.defineFlow(
    {
        name: 'generateWorkflow',
        inputSchema: GenerateWorkflowInputSchema,
        outputSchema: GenerateWorkflowOutputSchema,
    },
    async (input) => {
        try {
            console.log("Generating workflow with prompt:", input.prompt);
            const response = await generateWorkflowPrompt(input);
            if (!response.output) {
                console.error("Workflow generation returned null output");
                throw new Error('Failed to generate workflow: Null output');
            }
            console.log("Workflow generated successfully:", JSON.stringify(response.output).substring(0, 100) + "...");
            return response.output;
        } catch (error) {
            console.error("Error in generateWorkflow:", error);
            throw error; // Re-throw to be caught by the client
        }
    }
);

export async function generateWorkflow(input: GenerateWorkflowInput): Promise<GenerateWorkflowOutput> {
    return generateWorkflowFlow(input);
}
