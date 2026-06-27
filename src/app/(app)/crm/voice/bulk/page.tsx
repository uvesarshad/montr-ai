import BulkDialerListClient from './bulk-dialer-list-client';

export const dynamic = 'force-dynamic';

export default function BulkDialerPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Bulk Dialer</h1>
        <p className="text-sm text-muted-foreground">
          Place outbound calls to a list of contacts with throttling and an AI
          script. For workflow-driven dialing (loop a workflow over a contact
          segment), use the workflows editor and a <code>make_outbound_call</code> node.
        </p>
      </header>
      <BulkDialerListClient />
    </div>
  );
}
