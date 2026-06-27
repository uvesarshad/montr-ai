import { redirect } from 'next/navigation';

/**
 * Retired: the standalone Text conversation view is now the Text mode of the
 * unified workspace, opened by id via `?c=`. This route redirects there.
 */
export default async function TextConversationRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/ai-studio?mode=text&c=${encodeURIComponent(id)}`);
}
