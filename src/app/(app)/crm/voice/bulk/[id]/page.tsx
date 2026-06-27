import BulkBatchDetailClient from './bulk-batch-detail-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BulkBatchDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <BulkBatchDetailClient batchId={id} />;
}
