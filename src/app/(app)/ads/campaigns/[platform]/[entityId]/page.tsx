import { notFound } from 'next/navigation';
import { AdsCampaignDetail } from '@/components/ads/ads-campaign-detail';

export default async function AdsCampaignDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ platform: string; entityId: string }>;
    searchParams: Promise<{ name?: string }>;
}) {
    const { platform, entityId } = await params;
    const { name } = await searchParams;

    if (platform !== 'meta_ads' && platform !== 'google_ads') {
        notFound();
    }

    return (
        <AdsCampaignDetail
            platform={platform}
            entityId={decodeURIComponent(entityId)}
            name={name}
        />
    );
}
