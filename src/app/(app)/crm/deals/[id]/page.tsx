'use client';

import { use } from 'react';
import { useDeal } from '@/hooks/crm/use-deal';
import { DealDetail } from '@/components/crm/deals/deal-detail';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface DealDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function DealDetailPage({ params }: DealDetailPageProps) {
  const { id } = use(params);
  const { deal, loading, error, refetch } = useDeal(id);

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-96" />
            <Skeleton className="size-64" />
            <Skeleton className="size-48" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-96" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="rounded-xl border border-border bg-card container mx-auto py-12 text-center">
        <h2 className="text-2xl font-bold mb-4">Deal Not Found</h2>
        <p className="text-muted-foreground mb-6">
          {error || 'The deal you are looking for does not exist.'}
        </p>
        <Button asChild>
          <Link href="/crm/deals">
            <ArrowLeft className="mr-2 size-4" />
            Back to Deals
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <nav className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <Link href="/crm/deals" className="hover:text-foreground transition-colors">
          Deals
        </Link>
        <ChevronRight className="size-3 opacity-50" />
        <span className="text-foreground">
          {deal.name}
        </span>
      </nav>
      <DealDetail deal={deal} onUpdate={refetch} />
    </div>
  );
}
