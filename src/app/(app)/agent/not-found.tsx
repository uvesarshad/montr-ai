'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import { EmptyState, Button } from '@/components/ui-kit';

export default function AgentNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState
        icon={Bot}
        title="Mission not found"
        note="We couldn't find that mission. Start a new one or pick from your recent conversations."
        cta={
          <Button variant="primary" size="sm" asChild>
            <Link href="/agent">Open agent</Link>
          </Button>
        }
      />
    </div>
  );
}
