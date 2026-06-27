'use client';

import { useState } from 'react';
import { useWebhook, type WebhookLog } from '@/hooks/crm/use-webhook';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, XCircle, RotateCw, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface WebhookLogsProps {
  webhookId: string;
}

export function WebhookLogs({ webhookId }: WebhookLogsProps) {
  const { logs, logsLoading, retryLog } = useWebhook(webhookId);
  const { toast } = useToast();
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const handleRetry = async (logId: string) => {
    setRetrying(logId);
    try {
      await retryLog(logId);
      toast({
        title: 'Retry Initiated',
        description: 'The webhook delivery has been queued for retry.',
      });
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to retry webhook delivery.',
      });
    } finally {
      setRetrying(null);
    }
  };

  const viewDetails = (log: WebhookLog) => {
    setSelectedLog(log);
    setDialogOpen(true);
  };

  if (logsLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No delivery logs yet. This webhook has not been triggered.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {logs.map((log) => (
          <Card key={log._id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    {log.success ? (
                      <CheckCircle2 className="size-5 text-green-500" />
                    ) : (
                      <XCircle className="size-5 text-destructive" />
                    )}

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={log.success ? 'default' : 'destructive'}>
                          {log.responseStatus || 'Failed'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {log.event}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground ml-8">
                    <div>Method: {log.method}</div>
                    {log.retryCount > 0 && (
                      <div>Retries: {log.retryCount}</div>
                    )}
                    {log.deliveredAt && (
                      <div className="text-green-600">
                        Delivered {formatDistanceToNow(new Date(log.deliveredAt), { addSuffix: true })}
                      </div>
                    )}
                  </div>

                  {log.error && (
                    <div className="ml-8 p-3 bg-destructive/10 rounded-md">
                      <p className="text-sm font-medium text-destructive mb-1">Error:</p>
                      <p className="text-xs text-destructive">{log.error}</p>
                    </div>
                  )}

                  {log.nextRetryAt && (
                    <div className="ml-8 text-xs text-muted-foreground">
                      Next retry: {formatDistanceToNow(new Date(log.nextRetryAt), { addSuffix: true })}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => viewDetails(log)}
                  >
                    <Eye className="size-4 mr-1" />
                    View
                  </Button>
                  {!log.success && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetry(log._id)}
                      disabled={retrying === log._id}
                    >
                      <RotateCw className={`size-4 mr-1 ${retrying === log._id ? 'animate-spin' : ''}`} />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delivery Details</DialogTitle>
            <DialogDescription>
              Webhook delivery log from {selectedLog && formatDistanceToNow(new Date(selectedLog.createdAt), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Request</h4>
                <div className="p-3 bg-muted rounded-md space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">URL:</span>
                    <code className="text-xs">{selectedLog.url}</code>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Method:</span>
                    <Badge variant="outline">{selectedLog.method}</Badge>
                  </div>
                  {selectedLog.requestHeaders && Object.keys(selectedLog.requestHeaders).length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1">Headers:</p>
                      <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                        {JSON.stringify(selectedLog.requestHeaders, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium mb-1">Payload:</p>
                    <pre className="text-xs bg-background p-2 rounded overflow-x-auto max-h-40">
                      {JSON.stringify(selectedLog.requestBody, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Response</h4>
                <div className="p-3 bg-muted rounded-md space-y-2">
                  {selectedLog.responseStatus && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">Status:</span>
                      <Badge variant={selectedLog.success ? 'default' : 'destructive'}>
                        {selectedLog.responseStatus}
                      </Badge>
                    </div>
                  )}
                  {selectedLog.responseHeaders && Object.keys(selectedLog.responseHeaders).length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1">Headers:</p>
                      <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                        {JSON.stringify(selectedLog.responseHeaders, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedLog.responseBody && (
                    <div>
                      <p className="text-xs font-medium mb-1">Body:</p>
                      <pre className="text-xs bg-background p-2 rounded overflow-x-auto max-h-40">
                        {selectedLog.responseBody}
                      </pre>
                    </div>
                  )}
                  {selectedLog.error && (
                    <div className="p-2 bg-destructive/10 rounded">
                      <p className="text-xs font-medium text-destructive mb-1">Error:</p>
                      <p className="text-xs text-destructive">{selectedLog.error}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
