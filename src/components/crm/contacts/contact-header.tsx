'use client';

import { Contact } from '@/types/crm';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Edit, MoreVertical, Trash2, Mail, Phone, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RunAutomationMenu } from '@/components/crm/run-automation-menu';

interface ContactHeaderProps {
  contact: Contact;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
}

const statusColors = {
  lead: 'bg-blue-100 text-blue-800 border-blue-200',
  prospect: 'bg-purple-100 text-purple-800 border-purple-200',
  customer: 'bg-green-100 text-green-800 border-green-200',
  churned: 'bg-red-100 text-red-800 border-red-200',
  inactive: 'bg-gray-100 text-gray-800 border-gray-200',
};

const ratingColors = {
  hot: 'bg-red-100 text-red-800 border-red-200',
  warm: 'bg-orange-100 text-orange-800 border-orange-200',
  cold: 'bg-blue-100 text-blue-800 border-blue-200',
};

export function ContactHeader({
  contact,
  onEdit,
  onDelete,
  onToggleFavorite,
  isFavorite,
}: ContactHeaderProps) {
  const fullName = `${contact.firstName} ${contact.lastName || ''}`.trim();
  const initials = `${contact.firstName[0]}${contact.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="flex items-start justify-between pb-6 border-b">
      <div className="flex items-start gap-4">
        <Avatar className="size-16">
          <AvatarImage src={contact.avatar} />
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{fullName}</h1>
            {onToggleFavorite && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFavorite}
                className="size-8 p-0"
              >
                <Star
                  className={cn('size-4', isFavorite && 'fill-yellow-400 text-yellow-400')}
                />
              </Button>
            )}
          </div>

          {contact.jobTitle && (
            <p className="text-muted-foreground">
              {contact.jobTitle}
              {contact.department && ` • ${contact.department}`}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusColors[contact.status]}>
              {contact.status}
            </Badge>
            <Badge variant="outline" className={ratingColors[contact.rating]}>
              {contact.rating}
            </Badge>
            <Badge variant="outline">{contact.lifecycle}</Badge>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Mail className="size-4" />
                {contact.email}
              </a>
            )}
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Phone className="size-4" />
                {contact.phone}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <RunAutomationMenu entityType="contact" recordIds={[contact._id]} availability="single" />

        {onEdit && (
          <Button onClick={onEdit} size="sm">
            <Edit className="mr-2 size-4" />
            Edit
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {contact.email && (
              <DropdownMenuItem asChild>
                <a href={`mailto:${contact.email}`}>
                  <Mail className="mr-2 size-4" />
                  Send Email
                </a>
              </DropdownMenuItem>
            )}
            {contact.phone && (
              <DropdownMenuItem asChild>
                <a href={`tel:${contact.phone}`}>
                  <Phone className="mr-2 size-4" />
                  Call
                </a>
              </DropdownMenuItem>
            )}
            {(contact.email || contact.phone) && <DropdownMenuSeparator />}
            {onDelete && (
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
