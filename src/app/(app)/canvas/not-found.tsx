'use client';

import Link from 'next/link';
import { Workflow } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui-kit';

export default function CanvasNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
      <EmptyState
        icon={Workflow}
        title="Canvas not found"
        note="That canvas doesn't exist or has been deleted. Pick one from your library or start a new one."
        cta={
          <Button asChild variant="primary" size="sm">
            <Link href="/canvas">My canvases</Link>
          </Button>
        }
        secondary={
          <Button asChild variant="outline" size="sm">
            <Link href="/canvas/templates">Templates</Link>
          </Button>
        }
      />
    </div>
  );
}
