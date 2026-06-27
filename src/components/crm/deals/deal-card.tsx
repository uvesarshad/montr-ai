'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Deal } from '@/types/crm';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreVertical, Building2, User, Calendar, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

interface PopulatedCompany { name?: string }
interface PopulatedContact { firstName?: string; lastName?: string }
interface PopulatedOwner { firstName?: string; lastName?: string; avatar?: string }
interface PopulatedTag { name?: string }

interface DealCardProps {
  deal: Deal;
  onEdit?: (deal: Deal) => void;
  onDelete?: (dealId: string) => void;
}

const priorityConfig = {
  low: { label: 'Low', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]' },
  medium: { label: 'Medium', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]' },
  high: { label: 'High', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20 shadow-[0_0_10px_rgba(249,115,22,0.1)]' },
  urgent: { label: 'Urgent', color: 'bg-red-500/10 text-red-500 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' },
};

export function DealCard({ deal, onEdit, onDelete }: DealCardProps) {
  const { push } = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: deal._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const formatCurrency = (value: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on dropdown menu or buttons
    const target = e.target as HTMLElement;
    if (
      target.closest('[role="menuitem"]') ||
      target.closest('button') ||
      target.closest('[data-radix-collection-item]')
    ) {
      return;
    }
    push(`/crm/deals/${deal._id}`);
  };

  const priorityInfo = priorityConfig[deal.priority] || priorityConfig.medium;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-4 cursor-grab active:cursor-grabbing hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-border/40 bg-card/80 backdrop-blur-xl group overflow-hidden"
      onClick={handleCardClick}
    >
      <div className="absolute top-0 right-0 size-24 bg-gradient-to-br from-primary/10 to-transparent blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 -z-10 translate-x-10 -translate-y-10"></div>
      <div className="space-y-3 relative z-10">
        {/* Header with name and actions */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm line-clamp-2 flex-1">{deal.name}</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0 flex-shrink-0"
              >
                <MoreVertical className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => push(`/crm/deals/${deal._id}`)}>
                View Details
              </DropdownMenuItem>
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(deal)}>
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(deal._id)}
                  className="text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Company/Contact info */}
        {(deal.companyId || deal.contactId) && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {deal.companyId && (
              <div className="flex items-center gap-1">
                <Building2 className="size-3" />
                <span className="truncate">
                  {typeof deal.companyId === 'object' && deal.companyId && 'name' in deal.companyId
                    ? (deal.companyId as PopulatedCompany).name
                    : 'Company'}
                </span>
              </div>
            )}
            {deal.contactId && !deal.companyId && (
              <div className="flex items-center gap-1">
                <User className="size-3" />
                <span className="truncate">
                  {typeof deal.contactId === 'object' && deal.contactId && 'firstName' in deal.contactId
                    ? `${(deal.contactId as PopulatedContact).firstName} ${(deal.contactId as PopulatedContact).lastName || ''}`.trim()
                    : 'Contact'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Value and Priority */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-sm font-semibold">
            <DollarSign className="size-3.5 text-muted-foreground" />
            {formatCurrency(deal.value, deal.currency)}
          </div>
          <Badge
            className={`text-xs px-1.5 py-0.5 ${priorityInfo.color}`}
            variant="outline"
          >
            {priorityInfo.label}
          </Badge>
        </div>

        {/* Owner and Close Date */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            {deal.ownerId ? (
              <>
                <Avatar className="size-5">
                  <AvatarImage
                    src={
                      typeof deal.ownerId === 'object' && deal.ownerId && 'avatar' in deal.ownerId
                        ? (deal.ownerId as PopulatedOwner).avatar
                        : undefined
                    }
                  />
                  <AvatarFallback className="text-xs">
                    {typeof deal.ownerId === 'object' && deal.ownerId && 'firstName' in deal.ownerId
                      ? (deal.ownerId as PopulatedOwner).firstName?.charAt(0)
                      : 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground truncate">
                  {typeof deal.ownerId === 'object' && deal.ownerId && 'firstName' in deal.ownerId
                    ? `${(deal.ownerId as PopulatedOwner).firstName} ${(deal.ownerId as PopulatedOwner).lastName || ''}`.trim()
                    : 'Owner'}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            )}
          </div>

          {deal.expectedCloseDate && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="size-3" />
              <span>{format(new Date(deal.expectedCloseDate), 'MMM d')}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {deal.tags && deal.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {deal.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-1.5 py-0 h-5"
              >
                {typeof tag === 'object' && tag && 'name' in tag ? (tag as PopulatedTag).name : tag}
              </Badge>
            ))}
            {deal.tags.length > 2 && (
              <Badge
                variant="secondary"
                className="text-xs px-1.5 py-0 h-5"
              >
                +{deal.tags.length - 2}
              </Badge>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
