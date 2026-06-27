'use client';

import { useState } from 'react';
import type React from 'react';
import { Deal } from '@/types/crm';
import { buildDealInsight } from '@/lib/crm/ai-insights';
import { CreateDealInput, UpdateDealInput } from '@/validations/crm/deal.schema';
import { DealHeader } from './deal-header';
import { DealSidebar } from './deal-sidebar';
import { DealOverview } from './deal-overview';
import { ActivityTimeline } from '../activities/activity-timeline';
import { CommentList } from '../comments/comment-list';
import { AttachmentList } from '../attachments/attachment-list';
import { AuditLogViewer } from '../shared/audit-log-viewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DealForm } from './deal-form';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DeleteConfirmationDialog } from '../shared/delete-confirmation-dialog';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { usePipelines } from '@/hooks/crm/use-pipelines';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { openAgentLauncher } from '@/lib/agent/launcher';
import { useRecordLayout } from '@/hooks/crm/use-record-layout';
import { visibleKeys, RECORD_LAYOUT_SECTIONS } from '../shared/record-layout-sections';

interface DealDetailProps {
  deal: Deal;
  onUpdate?: () => void;
}

export function DealDetail({ deal, onUpdate }: DealDetailProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { push } = useRouter();
  const { sections: layout } = useRecordLayout('deal');

  // Fetch pipelines to get pipeline details
  const { pipelines, loading: pipelinesLoading } = usePipelines({ isActive: true });
  const pipeline = pipelines.find((p) => p._id === deal.pipelineId);

  const handleUpdate = async (data: CreateDealInput | UpdateDealInput) => {
    try {
      setIsSubmitting(true);

      const response = await fetch(`/api/v2/crm/deals/${deal._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update deal');
      }

      toast({
        title: 'Success',
        description: 'Deal updated successfully',
      });

      setIsEditOpen(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error updating deal:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update deal',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/v2/crm/deals/${deal._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete deal');
      }

      toast({
        title: 'Success',
        description: 'Deal deleted successfully',
      });

      push('/crm/deals');
    } catch (error) {
      console.error('Error deleting deal:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete deal',
      });
    }
  };

  if (pipelinesLoading || !pipeline) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="lg:col-span-1">
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const dealInsight = buildDealInsight(deal, pipeline);

  const labels = Object.fromEntries(
    RECORD_LAYOUT_SECTIONS.deal.map((s) => [s.key, s.label])
  );
  const mainKeys = visibleKeys(layout, 'main');
  const sideKeys = visibleKeys(layout, 'side');

  const mainContent: Record<string, React.ReactNode> = {
    overview: <DealOverview deal={deal} pipeline={pipeline} />,
    timeline: <ActivityTimeline targetType="deal" targetId={deal._id} />,
    comments: <CommentList targetType="deal" targetId={deal._id} />,
    attachments: <AttachmentList targetType="deal" targetId={deal._id} />,
    history: <AuditLogViewer entityType="deal" entityId={deal._id} showFilters={true} />,
  };

  const openAgent = () => {
    openAgentLauncher({
      prompt: dealInsight.prompt,
      context: {
        source: 'crm_deal_detail',
        entityType: 'deal',
        entityId: deal._id,
        entityLabel: deal.name,
        route: `/crm/deals/${deal._id}`,
        notes: [
          `Pipeline: ${pipeline.name}`,
          typeof deal.value === 'number' ? `Value: ${deal.value}` : '',
          deal.stageId ? `Stage: ${deal.stageId}` : '',
        ].filter((note): note is string => Boolean(note)),
      },
    });
  };

  return (
    <>
      <div className="space-y-6">
        <DealHeader
          deal={deal}
          pipeline={pipeline}
          onEdit={() => setIsEditOpen(true)}
          onDelete={() => setIsDeleteOpen(true)}
          onUpdate={onUpdate}
        />

        <Card className="border-border/40 bg-card/60 backdrop-blur-md">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{dealInsight.severity} risk</Badge>
                  <Badge variant="secondary">AI summary</Badge>
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">{dealInsight.title}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{dealInsight.summary}</p>
                </div>
                <p className="text-sm">
                  <span className="font-medium text-foreground">Primary blocker:</span>{' '}
                  <span className="text-muted-foreground">{dealInsight.blocker}</span>
                </p>
                <p className="text-sm">
                  <span className="font-medium text-foreground">Recommended next step:</span>{' '}
                  <span className="text-muted-foreground">{dealInsight.nextStep}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {dealInsight.evidence.map((item) => (
                    <Badge key={item} variant="outline" className="bg-background/60">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>

              <Button onClick={openAgent} className="shrink-0">
                <Sparkles className="mr-2 size-4" />
                {dealInsight.actionLabel}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div
          className={`grid grid-cols-1 gap-6 ${sideKeys.length ? 'lg:grid-cols-3' : ''}`}
        >
          {mainKeys.length > 0 && (
            <div className={sideKeys.length ? 'lg:col-span-2' : ''}>
              <Tabs defaultValue={mainKeys[0]} className="space-y-4">
                <div className="max-w-full overflow-x-auto">
                  <TabsList>
                    {mainKeys.map((key) => (
                      <TabsTrigger key={key} value={key}>
                        {labels[key] ?? key}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {mainKeys.map((key) => (
                  <TabsContent key={key} value={key} className="space-y-4">
                    {mainContent[key]}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}

          {sideKeys.includes('sidebar') && (
            <div className="lg:col-span-1">
              <DealSidebar deal={deal} pipeline={pipeline} onUpdate={onUpdate} />
            </div>
          )}
        </div>
      </div>

      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Deal</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <DealForm
              deal={deal}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditOpen(false)}
              isSubmitting={isSubmitting}
            />
          </div>
        </SheetContent>
      </Sheet>

      <DeleteConfirmationDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onConfirm={handleDelete}
        title="Delete Deal"
        description="Are you sure you want to delete this deal? This action cannot be undone and will remove all associated activities."
      />
    </>
  );
}
