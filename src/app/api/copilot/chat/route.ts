import { handleAgentChatRequest } from '@/lib/agent/agent-chat-route';

export async function POST(req: Request) {
  return handleAgentChatRequest(req);
}
