import { redirect } from 'next/navigation';

/** Retired: the standalone Image page is now the Image mode of the unified workspace. */
export default function ImageRedirect() {
  redirect('/ai-studio?mode=image');
}
