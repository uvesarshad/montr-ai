import { redirect } from 'next/navigation';

/**
 * Retired: the standalone Image history view is now hosted read-only in the
 * unified workspace (Image mode), opened by id via `?c=`. Redirect there.
 */
export default async function ImageHistoryRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/ai-studio?mode=image&c=${encodeURIComponent(id)}`);
}
