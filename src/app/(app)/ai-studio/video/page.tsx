import { redirect } from 'next/navigation';

/** Retired: the standalone Video page is now the Video mode of the unified workspace. */
export default function VideoRedirect() {
  redirect('/ai-studio?mode=video');
}
