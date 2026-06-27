import { redirect } from 'next/navigation';

export default async function EmailAccountsPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const params = new URLSearchParams({ tab: 'connections' });

  const success = typeof searchParams?.success === 'string' ? searchParams.success : undefined;
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;

  if (success) {
    params.set('success', success);
  }

  if (error) {
    params.set('error', error);
  }

  redirect(`/settings?${params.toString()}`);
}
