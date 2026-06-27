'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Company } from '@/types/crm';
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
import { MoreHorizontal, Globe, Building2, Eye, Edit, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface CompanyColumnOptions {
  isFavorite?: (targetId: string) => boolean;
  onFavoriteToggle?: (targetId: string, isFavorite: boolean) => void;
}

const getTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    prospect: 'bg-blue-500/10 text-blue-500',
    customer: 'bg-green-500/10 text-green-500',
    partner: 'bg-purple-500/10 text-purple-500',
    vendor: 'bg-orange-500/10 text-orange-500',
    competitor: 'bg-red-500/10 text-red-500',
  };
  return colors[type] || 'bg-gray-500/10 text-gray-500';
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function getCompanyColumns(
  onEdit?: (company: Company) => void,
  onDelete?: (company: Company) => void,
  options?: CompanyColumnOptions
): ColumnDef<Company>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Company',
      cell: ({ row }) => {
        const company = row.original;

        return (
          <div className="flex items-center gap-2">
            <FavoriteButton
              targetType="company"
              targetId={company._id}
              initialIsFavorite={options?.isFavorite?.(company._id) ?? false}
              size="sm"
              variant="ghost"
              showTooltip={false}
              onToggle={(isFavorite) => options?.onFavoriteToggle?.(company._id, isFavorite)}
            />
            <Link href={`/crm/companies/${company._id}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  {company.logo && <AvatarImage src={company.logo} alt={company.name} />}
                  <AvatarFallback className="text-xs bg-primary/10">
                    <Building2 className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="font-medium truncate">{company.name}</div>
                  {company.industry && (
                    <div className="text-xs text-muted-foreground truncate">{company.industry}</div>
                  )}
                </div>
              </div>
            </Link>
          </div>
        );
      },
    },
    {
      accessorKey: 'website',
      header: 'Website',
      cell: ({ row }) => {
        const website = row.getValue('website') as string;
        if (!website) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <Globe className="size-3 text-muted-foreground" />
            <a
              href={website.startsWith('http') ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {website.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          </div>
        );
      },
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.getValue('type') as string;
        return (
          <Badge variant="outline" className={getTypeColor(type)}>
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'size',
      header: 'Size',
      cell: ({ row }) => {
        const size = row.getValue('size') as string;
        if (!size) return <span className="text-muted-foreground">—</span>;
        return (
          <Badge variant="secondary" className="font-normal">
            {size}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'contactCount',
      header: 'Contacts',
      cell: ({ row }) => {
        const count = row.getValue('contactCount') as number;
        return (
          <span className="text-sm">
            {count || 0}
          </span>
        );
      },
    },
    {
      accessorKey: 'dealCount',
      header: 'Deals',
      cell: ({ row }) => {
        const count = row.getValue('dealCount') as number;
        return (
          <span className="text-sm">
            {count || 0}
          </span>
        );
      },
    },
    {
      accessorKey: 'totalDealValue',
      header: 'Total Value',
      cell: ({ row }) => {
        const value = row.getValue('totalDealValue') as number;
        if (!value || value === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <span className="text-sm font-medium">
            {formatCurrency(value)}
          </span>
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
            {tags.slice(0, 2).map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
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
        const company = row.original;

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
                <Link href={`/crm/companies/${company._id}`}>
                  <Eye className="mr-2 size-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {onEdit && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(company);
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
                    onDelete(company);
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
