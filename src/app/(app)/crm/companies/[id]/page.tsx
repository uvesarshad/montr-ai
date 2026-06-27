'use client';

import { use } from 'react';
import { useCompany } from '@/hooks/crm/use-company';
import { CompanyDetail } from '@/components/crm/companies/company-detail';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface CompanyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function CompanyDetailPage({ params }: CompanyDetailPageProps) {
  const { id } = use(params);
  const { company, loading, error, refetch } = useCompany(id);

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
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

  if (error || !company) {
    return (
      <div className="rounded-xl border border-border bg-card container mx-auto py-12 text-center">
        <h2 className="text-2xl font-bold mb-4">Company Not Found</h2>
        <p className="text-muted-foreground mb-6">
          {error || 'The company you are looking for does not exist.'}
        </p>
        <Button asChild>
          <Link href="/crm/companies">
            <ArrowLeft className="mr-2 size-4" />
            Back to Companies
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <nav className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <Link href="/crm/companies" className="hover:text-foreground transition-colors">
          Companies
        </Link>
        <ChevronRight className="size-3 opacity-50" />
        <span className="text-foreground">
          {company.name}
        </span>
      </nav>
      <CompanyDetail company={company} onUpdate={refetch} />
    </div>
  );
}
