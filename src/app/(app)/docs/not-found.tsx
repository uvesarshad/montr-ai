import Link from 'next/link';
import { Button } from '@/components/ui-kit';

export default function DocsNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Docs</p>
      <h1 className="text-2xl font-semibold tracking-tight">Document not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        That document doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Button asChild size="sm">
        <Link href="/docs">All documents</Link>
      </Button>
    </div>
  );
}
