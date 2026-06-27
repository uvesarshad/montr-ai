'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function CreateContactButton() {
  const router = useRouter();

  return (
    <Button onClick={() => router.push('/crm/contacts/new')} className="gap-2">
      <Plus className="size-4" />
      New Contact
    </Button>
  );
}
