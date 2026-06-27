'use client';

import { useContacts } from '@/hooks/crm/use-contacts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Phone, Plus } from 'lucide-react';
import Link from 'next/link';

interface CompanyContactsTabProps {
  companyId: string;
}

export function CompanyContactsTab({ companyId }: CompanyContactsTabProps) {
  const { contacts, loading } = useContacts({
    companyId,
    limit: 50,
  });

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="size-48" />
                <Skeleton className="size-32" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground mb-4">No contacts found for this company</p>
        <Button asChild>
          <Link href={`/crm/contacts/new?companyId=${companyId}`}>
            <Plus className="mr-2 size-4" />
            Add Contact
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button asChild size="sm">
          <Link href={`/crm/contacts/new?companyId=${companyId}`}>
            <Plus className="mr-2 size-4" />
            Add Contact
          </Link>
        </Button>
      </div>

      {contacts.map((contact) => (
        <Link key={contact._id} href={`/crm/contacts/${contact._id}`}>
          <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <Avatar>
                  <AvatarImage src={contact.avatar} />
                  <AvatarFallback>
                    {contact.firstName[0]}
                    {contact.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>

                <div className="space-y-1">
                  <h4 className="font-medium">
                    {contact.firstName} {contact.lastName}
                  </h4>
                  {contact.jobTitle && (
                    <p className="text-sm text-muted-foreground">{contact.jobTitle}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Mail className="size-3" />
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Phone className="size-3" />
                        {contact.phone}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{contact.status}</Badge>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
