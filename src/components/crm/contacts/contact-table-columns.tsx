'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Contact } from '@/types/crm';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/crm/favorites/favorite-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Mail, Phone, Eye, Edit, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface ContactColumnOptions {
  isFavorite?: (targetId: string) => boolean;
  onFavoriteToggle?: (targetId: string, isFavorite: boolean) => void;
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    lead: 'bg-blue-500/10 text-blue-500',
    prospect: 'bg-purple-500/10 text-purple-500',
    customer: 'bg-green-500/10 text-green-500',
    churned: 'bg-red-500/10 text-red-500',
    inactive: 'bg-gray-500/10 text-gray-500',
  };
  return colors[status] || 'bg-gray-500/10 text-gray-500';
};

const getRatingColor = (rating: string) => {
  const colors: Record<string, string> = {
    hot: 'bg-red-500/10 text-red-500 border-red-500/20',
    warm: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    cold: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  };
  return colors[rating] || 'bg-gray-500/10 text-gray-500';
};

export function getContactColumns(
  onEdit?: (contact: Contact) => void,
  onDelete?: (contact: Contact) => void,
  options?: ContactColumnOptions
): ColumnDef<Contact>[] {
  return [
    {
      accessorKey: 'firstName',
      header: 'Contact',
      cell: ({ row }) => {
        const contact = row.original;
        const fullName = [contact.firstName, contact.lastName]
          .filter(Boolean)
          .join(' ');
        const initials = [contact.firstName?.[0], contact.lastName?.[0]]
          .filter(Boolean)
          .join('')
          .toUpperCase();

        return (
          <div className="flex items-center gap-2">
            <FavoriteButton
              targetType="contact"
              targetId={contact._id}
              initialIsFavorite={options?.isFavorite?.(contact._id) ?? false}
              size="sm"
              variant="ghost"
              showTooltip={false}
              onToggle={(isFavorite) => options?.onFavoriteToggle?.(contact._id, isFavorite)}
            />
            <Link href={`/crm/contacts/${contact._id}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  {contact.avatar && <AvatarImage src={contact.avatar} alt={fullName} />}
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="font-medium truncate">{fullName}</div>
                  {contact.jobTitle && (
                    <div className="text-xs text-muted-foreground truncate">{contact.jobTitle}</div>
                  )}
                </div>
              </div>
            </Link>
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => {
        const email = row.getValue('email') as string;
        if (!email) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <Mail className="size-3 text-muted-foreground" />
            <a
              href={`mailto:${email}`}
              className="text-sm hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {email}
            </a>
          </div>
        );
      },
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => {
        const phone = row.getValue('phone') as string;
        if (!phone) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <Phone className="size-3 text-muted-foreground" />
            <a
              href={`tel:${phone}`}
              className="text-sm hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {phone}
            </a>
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return (
          <Badge variant="outline" className={getStatusColor(status)}>
            {status}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'lifecycle',
      header: 'Lifecycle',
      cell: ({ row }) => {
        const lifecycle = row.getValue('lifecycle') as string;
        return (
          <Badge variant="secondary" className="capitalize">
            {lifecycle}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'rating',
      header: 'Rating',
      cell: ({ row }) => {
        const rating = row.getValue('rating') as string;
        return (
          <Badge variant="outline" className={getRatingColor(rating)}>
            {rating}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'tags',
      header: 'Tags',
      cell: ({ row }) => {
        const tags = row.getValue('tags') as string[];
        if (!tags || tags.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex gap-1 flex-wrap">
            {tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{tags.length - 2}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => {
        const date = row.getValue('createdAt') as Date;
        return (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(date), { addSuffix: true })}
          </span>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const contact = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/crm/contacts/${contact._id}`}>
                  <Eye className="mr-2 size-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {onEdit && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(contact);
                  }}
                >
                  <Edit className="mr-2 size-4" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onDelete && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(contact);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
