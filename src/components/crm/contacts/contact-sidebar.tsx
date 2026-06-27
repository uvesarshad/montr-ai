'use client';

import { Contact } from '@/types/crm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  User,
  Calendar,
  Activity,
  Mail,
  MessageSquare,
  Tag,
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { RelatedRecords } from '../shared/related-records';

interface ContactSidebarProps {
  contact: Contact;
}

export function ContactSidebar({ contact }: ContactSidebarProps) {
  return (
    <div className="space-y-4">
      {/* Quick Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Quick Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {contact.email && (
            <div className="flex items-start gap-2">
              <Mail className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <a
                  href={`mailto:${contact.email}`}
                  className="text-sm text-primary hover:underline truncate block"
                >
                  {contact.email}
                </a>
              </div>
            </div>
          )}

          {contact.phone && (
            <div className="flex items-start gap-2">
              <MessageSquare className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Phone</p>
                <a
                  href={`tel:${contact.phone}`}
                  className="text-sm text-primary hover:underline"
                >
                  {contact.phone}
                </a>
              </div>
            </div>
          )}

          {contact.companyId && (
            <div className="flex items-start gap-2">
              <Building2 className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Company</p>
                <Link
                  href={`/crm/companies/${contact.companyId}`}
                  className="text-sm text-primary hover:underline"
                >
                  View Company
                </Link>
              </div>
            </div>
          )}

          {contact.ownerId && (
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
              <p className="text-sm">{format(new Date(contact.createdAt), 'MMM d, yyyy')}</p>
            </div>
          </div>

          {contact.lastActivityAt && (
            <div className="flex items-start gap-2">
              <Activity className="size-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Last Activity</p>
                <p className="text-sm">
                  {format(new Date(contact.lastActivityAt), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      {contact.tags && contact.tags.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="size-4" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {contact.tags.map((tagId) => (
                <Badge key={tagId} variant="secondary">
                  Tag
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Activity Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Activities</span>
            <span className="font-medium">{contact.totalActivities || 0}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Emails</span>
            <span className="font-medium">{contact.totalEmails || 0}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Score</span>
            <span className="font-medium">{contact.score || 0}</span>
          </div>
        </CardContent>
      </Card>

      {/* Related records (generic any↔any links) */}
      <RelatedRecords recordType="contact" recordId={contact._id} />
    </div>
  );
}
