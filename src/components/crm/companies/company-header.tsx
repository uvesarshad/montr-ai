'use client';

import { Company } from '@/types/crm';
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
import { Edit, MoreVertical, Trash2, Mail, Phone, Building2, Star, ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RunAutomationMenu } from '@/components/crm/run-automation-menu';

interface CompanyHeaderProps {
  company: Company;
  onEdit?: () => void;
  onDelete?: () => void;
  onAskAgent?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
}

const typeColors = {
  prospect: 'bg-blue-100 text-blue-800 border-blue-200',
  customer: 'bg-green-100 text-green-800 border-green-200',
  partner: 'bg-purple-100 text-purple-800 border-purple-200',
  vendor: 'bg-orange-100 text-orange-800 border-orange-200',
  competitor: 'bg-red-100 text-red-800 border-red-200',
};

export function CompanyHeader({
  company,
  onEdit,
  onDelete,
  onAskAgent,
  onToggleFavorite,
  isFavorite,
}: CompanyHeaderProps) {
  return (
    <div className="flex items-start justify-between pb-6 border-b">
      <div className="flex items-start gap-4">
        <Avatar className="size-16">
          <AvatarImage src={company.logo} />
          <AvatarFallback className="text-lg">
            <Building2 className="size-8" />
          </AvatarFallback>
        </Avatar>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{company.name}</h1>
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

          {company.industry && (
            <p className="text-muted-foreground">{company.industry}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={typeColors[company.type]}>
              {company.type}
            </Badge>
            {company.size && <Badge variant="outline">{company.size} employees</Badge>}
          </div>

          <div className="flex items-center gap-3 text-sm">
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-4" />
                {company.domain || 'Website'}
              </a>
            )}
            {company.email && (
              <a
                href={`mailto:${company.email}`}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Mail className="size-4" />
                {company.email}
              </a>
            )}
            {company.phone && (
              <a
                href={`tel:${company.phone}`}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Phone className="size-4" />
                {company.phone}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <RunAutomationMenu entityType="company" recordIds={[company._id]} availability="single" />

        {onAskAgent && (
          <Button variant="outline" size="sm" onClick={onAskAgent}>
            <Sparkles className="mr-2 size-4" />
            Ask Agent
          </Button>
        )}

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
            {company.website && (
              <DropdownMenuItem asChild>
                <a href={company.website} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 size-4" />
                  Visit Website
                </a>
              </DropdownMenuItem>
            )}
            {company.email && (
              <DropdownMenuItem asChild>
                <a href={`mailto:${company.email}`}>
                  <Mail className="mr-2 size-4" />
                  Send Email
                </a>
              </DropdownMenuItem>
            )}
            {(company.website || company.email) && <DropdownMenuSeparator />}
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
