'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function CreateCompanyButton() {
  const router = useRouter();

  return (
    <Button onClick={() => router.push('/crm/companies/new')} className="gap-2">
      <Plus className="size-4" />
      New Company
    </Button>
  );
}
