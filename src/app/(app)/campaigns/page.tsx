import { redirect } from 'next/navigation';
import { MarketingEmailOverview } from '@/components/marketing/marketing-overview';
import { getMarketingWorkspaceData } from '@/lib/marketing/workspace.server';

export default async function MarketingEmailPage() {
  const data = await getMarketingWorkspaceData();

  if (!data) {
    redirect('/login');
  }

  return <MarketingEmailOverview data={data} />;
}
