import { redirect } from 'next/navigation';

/** Retired: the standalone Text page is now the Text mode of the unified workspace. */
export default function TextRedirect() {
  redirect('/ai-studio?mode=text');
}
