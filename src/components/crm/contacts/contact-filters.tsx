'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ContactFiltersProps {
  status?: string;
  lifecycle?: string;
  rating?: string;
  onStatusChange?: (value: string) => void;
  onLifecycleChange?: (value: string) => void;
  onRatingChange?: (value: string) => void;
}

export function ContactFilters({
  status,
  lifecycle,
  rating,
  onStatusChange,
  onLifecycleChange,
  onRatingChange,
}: ContactFiltersProps) {
  return (
    <>
      {onStatusChange && (
        <Select value={status || 'all'} onValueChange={onStatusChange}>
          <SelectTrigger>
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="churned">Churned</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      )}

      {onLifecycleChange && (
        <Select value={lifecycle || 'all'} onValueChange={onLifecycleChange}>
          <SelectTrigger>
            <SelectValue placeholder="All Lifecycles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lifecycles</SelectItem>
            <SelectItem value="subscriber">Subscriber</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="mql">MQL</SelectItem>
            <SelectItem value="sql">SQL</SelectItem>
            <SelectItem value="opportunity">Opportunity</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="evangelist">Evangelist</SelectItem>
          </SelectContent>
        </Select>
      )}

      {onRatingChange && (
        <Select value={rating || 'all'} onValueChange={onRatingChange}>
          <SelectTrigger>
            <SelectValue placeholder="All Ratings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ratings</SelectItem>
            <SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="cold">Cold</SelectItem>
          </SelectContent>
        </Select>
      )}
    </>
  );
}
