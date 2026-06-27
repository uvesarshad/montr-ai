import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function CrmNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CRM</p>
      <h1 className="text-2xl font-semibold tracking-tight">Record not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        We couldn&apos;t locate that contact, company, or deal. It may have been
        deleted or moved to another organization.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild size="sm">
          <Link href="/crm">Back to CRM</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/crm/contacts">All contacts</Link>
        </Button>
      </div>
    </div>
  );
}
