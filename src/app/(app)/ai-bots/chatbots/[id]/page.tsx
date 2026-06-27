import { redirect } from 'next/navigation';

export default async function EditChatbotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/ai-bots/${id}`);
}
