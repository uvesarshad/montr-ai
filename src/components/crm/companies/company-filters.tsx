'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CompanyFiltersProps {
  type?: string;
  industry?: string;
  size?: string;
  onTypeChange?: (value: string) => void;
  onIndustryChange?: (value: string) => void;
  onSizeChange?: (value: string) => void;
}

export function CompanyFilters({
  type,
  industry,
  size,
  onTypeChange,
  onIndustryChange,
  onSizeChange,
}: CompanyFiltersProps) {
  return (
    <>
      {onTypeChange && (
        <Select value={type || 'all'} onValueChange={onTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="partner">Partner</SelectItem>
            <SelectItem value="vendor">Vendor</SelectItem>
            <SelectItem value="competitor">Competitor</SelectItem>
          </SelectContent>
        </Select>
      )}

      {onSizeChange && (
        <Select value={size || 'all'} onValueChange={onSizeChange}>
          <SelectTrigger>
            <SelectValue placeholder="All Sizes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sizes</SelectItem>
            <SelectItem value="1-10">1-10</SelectItem>
            <SelectItem value="11-50">11-50</SelectItem>
            <SelectItem value="51-200">51-200</SelectItem>
            <SelectItem value="201-500">201-500</SelectItem>
            <SelectItem value="501-1000">501-1000</SelectItem>
            <SelectItem value="1000+">1000+</SelectItem>
          </SelectContent>
        </Select>
      )}

      {onIndustryChange && (
        <Select value={industry || 'all'} onValueChange={onIndustryChange}>
          <SelectTrigger>
            <SelectValue placeholder="All Industries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Industries</SelectItem>
            <SelectItem value="technology">Technology</SelectItem>
            <SelectItem value="finance">Finance</SelectItem>
            <SelectItem value="healthcare">Healthcare</SelectItem>
            <SelectItem value="retail">Retail</SelectItem>
            <SelectItem value="manufacturing">Manufacturing</SelectItem>
            <SelectItem value="education">Education</SelectItem>
            <SelectItem value="real-estate">Real Estate</SelectItem>
            <SelectItem value="consulting">Consulting</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      )}
    </>
  );
}
