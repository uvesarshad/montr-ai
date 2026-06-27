'use client';

import Link from 'next/link';
import { Button, EmptyState } from '@/components/ui-kit';
import { FileText } from 'lucide-react';

export default function FormsNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
      <EmptyState
        icon={FileText}
        title="Form not found"
        note="That form doesn't exist or has been removed."
        cta={
          <Button variant="outline" size="sm" asChild>
            <Link href="/forms">All forms</Link>
          </Button>
        }
      />
    </div>
  );
}
