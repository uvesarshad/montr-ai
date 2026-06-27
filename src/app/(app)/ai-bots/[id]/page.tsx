import { ChatbotEditorPage } from '@/components/ai-bots/chatbot-editor-page';

export default async function EditAIBotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ChatbotEditorPage chatbotId={id} />;
}
