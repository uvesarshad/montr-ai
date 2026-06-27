import { redirect } from 'next/navigation';

/**
 * Retired: the standalone Video history view is now hosted read-only in the
 * unified workspace (Video mode), opened by id via `?c=`. Redirect there.
 */
export default async function VideoHistoryRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/ai-studio?mode=video&c=${encodeURIComponent(id)}`);
}
