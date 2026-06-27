'use client';

import { Deal, Pipeline } from '@/types/crm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StageSelector } from './stage-selector';
import { DealStageHistory } from './deal-stage-history';
import {
  Building2,
  User,
  Calendar,
  Activity,
  DollarSign,
  Tag,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { RelatedRecords } from '../shared/related-records';

interface DealSidebarProps {
  deal: Deal;
  pipeline: Pipeline;
  onUpdate?: () => void;
}

export function DealSidebar({ deal, pipeline, onUpdate }: DealSidebarProps) {
  const currentStage = pipeline.stages.find((s) => s._id === deal.stageId);
  const isOpen = deal.status === 'open';

  return (
    <div className="space-y-4">
      {/* Quick Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Deal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <DollarSign className="size-4 text-muted-foreground mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Value</p>
              <p className="text-sm font-semibold">
                {deal.currency} {deal.value.toLocaleString()}
              </p>
              {deal.actualCloseDate && deal.status === 'won' && (
                <p className="text-xs text-green-600 mt-0.5">
                  Closed {format(new Date(deal.actualCloseDate), 'MMM d, yyyy')}
                </p>
              )}
            </div>
          </div>

          {currentStage && (
            <div className="flex items-start gap-2">
              <TrendingUp className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Current Stage</p>
                <div className="flex items-center gap-2 mt-1">
                  <div
                    className="size-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: currentStage.color }}
                  />
                  <p className="text-sm">{currentStage.name}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentStage.probability}% probability
                </p>
              </div>
            </div>
          )}

          {isOpen && currentStage && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-2">Change Stage</p>
                <StageSelector
                  pipeline={pipeline}
                  currentStageId={deal.stageId}
                  dealId={deal._id}
                  onStageChange={onUpdate}
                />
              </div>
            </>
          )}

          <Separator />

          {deal.companyId && (
            <div className="flex items-start gap-2">
              <Building2 className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Company</p>
                <Link
                  href={`/crm/companies/${deal.companyId}`}
                  className="text-sm text-primary hover:underline"
                >
                  View Company
                </Link>
              </div>
            </div>
          )}

          {deal.contactId && (
            <div className="flex items-start gap-2">
              <User className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Contact</p>
                <Link
                  href={`/crm/contacts/${deal.contactId}`}
                  className="text-sm text-primary hover:underline"
                >
                  View Contact
                </Link>
              </div>
            </div>
          )}

          {deal.ownerId && (
            <div className="flex items-start gap-2">
              <User className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Owner</p>
                <p className="text-sm">Assigned</p>
              </div>
            </div>
          )}

          <Separator />

          {deal.expectedCloseDate && (
            <div className="flex items-start gap-2">
              <Calendar className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Expected Close</p>
                <p className="text-sm">{format(new Date(deal.expectedCloseDate), 'MMM d, yyyy')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(deal.expectedCloseDate), { addSuffix: true })}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2">
            <Clock className="size-4 text-muted-foreground mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm">{format(new Date(deal.createdAt), 'MMM d, yyyy')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(deal.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>

          {deal.lastActivityAt && (
            <div className="flex items-start gap-2">
              <Activity className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Last Activity</p>
                <p className="text-sm">
                  {format(new Date(deal.lastActivityAt), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      {deal.tags && deal.tags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="size-4" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {deal.tags.map((tagId) => (
                <Badge key={tagId} variant="secondary">
                  Tag
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stage History */}
      {deal.stageHistory && deal.stageHistory.length > 0 && (
        <DealStageHistory deal={deal} pipeline={pipeline} />
      )}

      {/* Activity Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Activity Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Activities</span>
            <span className="font-medium">{deal.totalActivities || 0}</span>
          </div>
          {deal.source && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Source</span>
              <span className="font-medium capitalize">{deal.source}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Related records (generic any↔any links) */}
      <RelatedRecords recordType="deal" recordId={deal._id} />
    </div>
  );
}
