'use client';

import { Deal, Pipeline } from '@/types/crm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Briefcase,
  Building2,
  Calendar,
  FileText,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

interface DealOverviewProps {
  deal: Deal;
  pipeline: Pipeline;
}

interface InfoRowProps {
  label: string;
  value?: string | number | null;
  href?: string;
}

function InfoRow({ label, value, href }: InfoRowProps) {
  if (!value) return null;

  return (
    <div className="flex justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {href ? (
        <a href={href} className="text-sm font-medium text-primary hover:underline">
          {value}
        </a>
      ) : (
        <span className="text-sm font-medium">{value}</span>
      )}
    </div>
  );
}

interface InfoCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function InfoCard({ title, icon, children }: InfoCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DealOverview({ deal, pipeline }: DealOverviewProps) {
  const currentStage = pipeline.stages.find((s) => s._id === deal.stageId);

  const hasDescription = deal.description && deal.description.trim().length > 0;
  const hasClosedInfo = deal.status === 'won' || deal.status === 'lost';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Deal Details */}
      <InfoCard title="Deal Details" icon={<Briefcase className="size-4" />}>
        <div className="space-y-0">
          <InfoRow label="Deal Name" value={deal.name} />
          <InfoRow
            label="Value"
            value={`${deal.currency} ${deal.value.toLocaleString()}`}
          />
          <InfoRow label="Currency" value={deal.currency} />
          <InfoRow label="Probability" value={`${deal.probability}%`} />
          <InfoRow label="Priority" value={deal.priority} />
          <InfoRow label="Status" value={deal.status} />
          {deal.source && <InfoRow label="Source" value={deal.source} />}
        </div>
      </InfoCard>

      {/* Pipeline & Stage */}
      <InfoCard title="Pipeline & Stage" icon={<TrendingUp className="size-4" />}>
        <div className="space-y-0">
          <InfoRow label="Pipeline" value={pipeline.name} />
          {currentStage && (
            <>
              <InfoRow label="Current Stage" value={currentStage.name} />
              <InfoRow label="Stage Probability" value={`${currentStage.probability}%`} />
              <InfoRow label="Stage Type" value={currentStage.type} />
            </>
          )}
        </div>
      </InfoCard>

      {/* Related Records */}
      {(deal.companyId || deal.contactId || deal.ownerId) && (
        <InfoCard title="Related Records" icon={<Building2 className="size-4" />}>
          <div className="space-y-0">
            {deal.companyId && (
              <InfoRow
                label="Company"
                value="View Company"
                href={`/crm/companies/${deal.companyId}`}
              />
            )}
            {deal.contactId && (
              <InfoRow
                label="Contact"
                value="View Contact"
                href={`/crm/contacts/${deal.contactId}`}
              />
            )}
            {deal.ownerId && <InfoRow label="Owner" value="Assigned" />}
          </div>
        </InfoCard>
      )}

      {/* Dates */}
      <InfoCard title="Important Dates" icon={<Calendar className="size-4" />}>
        <div className="space-y-0">
          <InfoRow
            label="Created"
            value={new Date(deal.createdAt).toLocaleDateString()}
          />
          <InfoRow
            label="Last Updated"
            value={new Date(deal.updatedAt).toLocaleDateString()}
          />
          {deal.expectedCloseDate && (
            <InfoRow
              label="Expected Close"
              value={new Date(deal.expectedCloseDate).toLocaleDateString()}
            />
          )}
          {deal.actualCloseDate && (
            <InfoRow
              label="Actual Close"
              value={new Date(deal.actualCloseDate).toLocaleDateString()}
            />
          )}
          {deal.lastActivityAt && (
            <InfoRow
              label="Last Activity"
              value={new Date(deal.lastActivityAt).toLocaleDateString()}
            />
          )}
          {deal.nextActivityAt && (
            <InfoRow
              label="Next Activity"
              value={new Date(deal.nextActivityAt).toLocaleDateString()}
            />
          )}
        </div>
      </InfoCard>

      {/* Description */}
      {hasDescription && (
        <InfoCard title="Description" icon={<FileText className="size-4" />}>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {deal.description}
          </p>
        </InfoCard>
      )}

      {/* Closed Deal Info */}
      {hasClosedInfo && (
        <InfoCard
          title={deal.status === 'won' ? 'Win Details' : 'Loss Details'}
          icon={<AlertCircle className="size-4" />}
        >
          <div className="space-y-0">
            {deal.wonReason && <InfoRow label="Reason for Win" value={deal.wonReason} />}
            {deal.lostReason && <InfoRow label="Reason for Loss" value={deal.lostReason} />}
            {deal.actualCloseDate && (
              <InfoRow
                label="Closed On"
                value={new Date(deal.actualCloseDate).toLocaleDateString()}
              />
            )}
          </div>
        </InfoCard>
      )}

      {/* Notes */}
      {deal.notes?.plainText && (
        <InfoCard title="Notes" icon={<FileText className="size-4" />}>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {deal.notes.plainText}
          </p>
        </InfoCard>
      )}

      {/* Custom Fields */}
      {deal.customFields && Object.keys(deal.customFields).length > 0 && (
        <InfoCard title="Custom Fields" icon={<FileText className="size-4" />}>
          <div className="space-y-0">
            {Object.entries(deal.customFields).map(([key, value]) => (
              <InfoRow key={key} label={key} value={String(value)} />
            ))}
          </div>
        </InfoCard>
      )}
    </div>
  );
}
