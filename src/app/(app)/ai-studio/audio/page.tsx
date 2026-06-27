import { redirect } from 'next/navigation';

/** Retired: Audio now lives in the unified workspace (currently "coming soon"). */
export default function AudioRedirect() {
  redirect('/ai-studio?mode=audio');
}
