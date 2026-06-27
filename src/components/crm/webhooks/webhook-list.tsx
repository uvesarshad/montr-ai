'use client';

import { useState } from 'react';
import { useWebhooks } from '@/hooks/crm/use-webhooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreVertical, Edit, Trash2, TestTube, FileText, Webhook as WebhookIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface WebhookListProps {
  onEdit?: (id: string) => void;
  onTest?: (id: string) => void;
  onViewLogs?: (id: string) => void;
}

export function WebhookList({ onEdit, onTest, onViewLogs }: WebhookListProps) {
  const { webhooks, loading, error, deleteWebhook } = useWebhooks();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [webhookToDelete, setWebhookToDelete] = useState<string | null>(null);
  const [_actionLoading, setActionLoading] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (!webhookToDelete) return;

    setActionLoading(webhookToDelete);
    try {
      await deleteWebhook(webhookToDelete);
      toast({
        title: 'Webhook Deleted',
        description: 'The webhook has been deleted successfully.',
      });
      setDeleteDialogOpen(false);
      setWebhookToDelete(null);
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete webhook.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (webhooks.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <WebhookIcon className="size-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No webhooks yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first webhook to integrate with external services.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {webhooks.map((webhook) => (
          <Card key={webhook._id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <WebhookIcon className="size-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">{webhook.name}</h3>
                    <Badge variant={webhook.isActive ? 'default' : 'secondary'}>
                      {webhook.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {webhook.description && (
                    <p className="text-sm text-muted-foreground">{webhook.description}</p>
                  )}

                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">URL:</span>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {webhook.url}
                      </code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Events:</span>
                      <div className="flex flex-wrap gap-1">
                        {webhook.events.slice(0, 3).map((event) => (
                          <Badge key={event} variant="outline" className="text-xs">
                            {event}
                          </Badge>
                        ))}
                        {webhook.events.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{webhook.events.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div>Deliveries: {webhook.deliveryCount}</div>
                    {webhook.failureCount > 0 && (
                      <div className="text-destructive">Failed: {webhook.failureCount}</div>
                    )}
                    {webhook.lastDeliveredAt && (
                      <div>
                        Last: {formatDistanceToNow(new Date(webhook.lastDeliveredAt), { addSuffix: true })}
                      </div>
                    )}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit?.(webhook._id)}>
                      <Edit className="size-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onTest?.(webhook._id)}>
                      <TestTube className="size-4 mr-2" />
                      Test
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewLogs?.(webhook._id)}>
                      <FileText className="size-4 mr-2" />
                      View Logs
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        setWebhookToDelete(webhook._id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="size-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this webhook? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
