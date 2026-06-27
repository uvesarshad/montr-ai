'use client';

import { useReducer, useState } from 'react';
import { Check, ChevronsUpDown, Building2, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCompanies } from '@/hooks/crm/use-companies';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { normalizeCompanySearchTerm, canCreateCompanyFromSearch } from './company-selector-utils';
import { Company } from '@/types/crm';

interface CompanySelectorProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  className?: string;
}

type DraftType = 'prospect' | 'customer' | 'partner' | 'vendor' | 'competitor';

interface DraftState {
  name: string;
  domain: string;
  website: string;
  type: DraftType;
}

type DraftAction =
  | { type: 'reset'; name: string }
  | { type: 'setName'; value: string }
  | { type: 'setDomain'; value: string }
  | { type: 'setWebsite'; value: string }
  | { type: 'setType'; value: DraftType };

const initialDraft: DraftState = {
  name: '',
  domain: '',
  website: '',
  type: 'prospect',
};

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'reset':
      return { name: action.name, domain: '', website: '', type: 'prospect' };
    case 'setName':
      return { ...state, name: action.value };
    case 'setDomain':
      return { ...state, domain: action.value };
    case 'setWebsite':
      return { ...state, website: action.value };
    case 'setType':
      return { ...state, type: action.value };
    default:
      return state;
  }
}

export function CompanySelector({ value, onChange, className }: CompanySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, dispatchDraft] = useReducer(draftReducer, initialDraft);
  const [createdCompany, setCreatedCompany] = useState<Company | null>(null);
  const { toast } = useToast();

  const { companies, refetch } = useCompanies({
    search,
    limit: 50,
  });

  const selectedCompany =
    companies.find((company) => company._id === value) ||
    (createdCompany?._id === value ? createdCompany : undefined);
  const normalizedSearch = normalizeCompanySearchTerm(search);
  const showCreateAction = canCreateCompanyFromSearch(search, companies);

  const openCreateDialog = () => {
    dispatchDraft({ type: 'reset', name: normalizedSearch });
    setOpen(false);
    setCreateDialogOpen(true);
  };

  const handleCreateCompany = async () => {
    const companyName = normalizeCompanySearchTerm(draft.name);

    if (!companyName) {
      toast({
        variant: 'destructive',
        title: 'Company name required',
        description: 'Enter a company name before creating it.',
      });
      return;
    }

    try {
      setIsCreating(true);

      const response = await fetch('/api/v2/crm/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: companyName,
          domain: draft.domain.trim(),
          website: draft.website.trim(),
          type: draft.type,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create company');
      }

      const newCompany = payload as Company;
      setCreatedCompany(newCompany);
      onChange(newCompany._id);
      setSearch(newCompany.name);
      setCreateDialogOpen(false);
      await refetch();

      toast({
        title: 'Company created',
        description: `${newCompany.name} has been added and selected.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to create company',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('w-full justify-between', className)}
          >
            {selectedCompany ? (
              <div className="flex min-w-0 items-center gap-2">
                <Avatar className="size-6">
                  <AvatarImage src={selectedCompany.logo} />
                  <AvatarFallback>
                    <Building2 className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{selectedCompany.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">Select company...</span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search companies..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandEmpty>No companies found.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {companies.map((company) => (
                <CommandItem
                  key={company._id}
                  value={company.name}
                  onSelect={() => {
                    onChange(company._id === value ? undefined : company._id);
                    setCreatedCompany(company);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      value === company._id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <Avatar className="mr-2 size-6">
                    <AvatarImage src={company.logo} />
                    <AvatarFallback>
                      <Building2 className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span>{company.name}</span>
                    {company.domain && (
                      <span className="text-xs text-muted-foreground">{company.domain}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {showCreateAction && (
                <CommandItem value={`create-${normalizedSearch}`} onSelect={openCreateDialog}>
                  <Plus className="mr-2 size-4 text-primary" />
                  <span>Create company</span>
                  <span className="ml-1 truncate text-muted-foreground">&quot;{normalizedSearch}&quot;</span>
                </CommandItem>
              )}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create Company</DialogTitle>
            <DialogDescription>
              Add a company without leaving the contact form. It will be selected automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="quick-company-name">Company name</Label>
              <Input
                id="quick-company-name"
                value={draft.name}
                onChange={(event) => dispatchDraft({ type: 'setName', value: event.target.value })}
                placeholder="Acme Inc."
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="quick-company-domain">Domain</Label>
              <Input
                id="quick-company-domain"
                value={draft.domain}
                onChange={(event) => dispatchDraft({ type: 'setDomain', value: event.target.value })}
                placeholder="acme.com"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="quick-company-website">Website</Label>
              <Input
                id="quick-company-website"
                value={draft.website}
                onChange={(event) => dispatchDraft({ type: 'setWebsite', value: event.target.value })}
                placeholder="https://acme.com"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="quick-company-type">Company type</Label>
              <Select value={draft.type} onValueChange={(value: DraftType) => dispatchDraft({ type: 'setType', value })}>
                <SelectTrigger id="quick-company-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="competitor">Competitor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateCompany} disabled={isCreating}>
              {isCreating && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create And Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
