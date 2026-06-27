'use client';

import { Company } from '@/types/crm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Calendar,
  Activity,
  TrendingUp,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';
import { RelatedRecords } from '../shared/related-records';

interface CompanySidebarProps {
  company: Company;
}

export function CompanySidebar({ company }: CompanySidebarProps) {
  return (
    <div className="space-y-4">
      {/* Quick Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Quick Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {company.domain && (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Domain</p>
                <p className="text-sm">{company.domain}</p>
              </div>
            </div>
          )}

          {company.employeeCount && (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Employees</p>
                <p className="text-sm">{company.employeeCount.toLocaleString()}</p>
              </div>
            </div>
          )}

          {company.annualRevenue && (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Annual Revenue</p>
                <p className="text-sm">${company.annualRevenue.toLocaleString()}</p>
              </div>
            </div>
          )}

          {company.ownerId && (
            <div className="flex items-start gap-2">
              <User className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Owner</p>
                <p className="text-sm">Assigned</p>
              </div>
            </div>
          )}

          <Separator />

          <div className="flex items-start gap-2">
            <Calendar className="size-4 text-muted-foreground mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm">{format(new Date(company.createdAt), 'MMM d, yyyy')}</p>
            </div>
          </div>

          {company.lastActivityAt && (
            <div className="flex items-start gap-2">
              <Activity className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Last Activity</p>
                <p className="text-sm">
                  {format(new Date(company.lastActivityAt), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Users className="size-3" />
              Contacts
            </span>
            <span className="font-medium">{company.contactCount || 0}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="size-3" />
              Deals
            </span>
            <span className="font-medium">{company.dealCount || 0}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Deal Value</span>
            <span className="font-medium">${(company.totalDealValue || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Won Value</span>
            <span className="font-medium text-green-600">
              ${(company.wonDealValue || 0).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Activities</span>
            <span className="font-medium">{company.totalActivities || 0}</span>
          </div>
        </CardContent>
      </Card>

      {/* Related records (generic any↔any links) */}
      <RelatedRecords recordType="company" recordId={company._id} />
    </div>
  );
}
