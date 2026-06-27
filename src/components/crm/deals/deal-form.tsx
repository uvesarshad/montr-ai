'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useEffect } from 'react';
import {
  createDealSchema,
  CreateDealInput,
  UpdateDealInput,
} from '@/validations/crm/deal.schema';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TagSelector } from '@/components/crm/shared/tag-selector';
import { OwnerSelector } from '@/components/crm/shared/owner-selector';
import { CompanySelector } from '@/components/crm/shared/company-selector';
import { Loader2 } from 'lucide-react';
import { Deal, Pipeline } from '@/types/crm';
import { Separator } from '@/components/ui/separator';
import { usePipelines } from '@/hooks/crm/use-pipelines';
import { useContacts } from '@/hooks/crm/use-contacts';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DealFormProps {
  deal?: Deal;
  onSubmit: (data: CreateDealInput | UpdateDealInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export function DealForm({ deal, onSubmit, onCancel, isSubmitting }: DealFormProps) {
  const { pipelines, loading: pipelinesLoading } = usePipelines({ isActive: true });
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(
    deal?.companyId
  );
  const [contactSearch, setContactSearch] = useState('');
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);

  // Fetch contacts filtered by company if selected
  const { contacts, loading: _contactsLoading } = useContacts({
    companyId: selectedCompanyId,
    search: contactSearch,
    limit: 50,
  });

  const form = useForm<CreateDealInput>({
    resolver: zodResolver(createDealSchema),
    defaultValues: deal
      ? {
          name: deal.name,
          description: deal.description || '',
          value: deal.value,
          currency: deal.currency,
          probability: deal.probability,
          expectedCloseDate: deal.expectedCloseDate
            ? new Date(deal.expectedCloseDate)
            : undefined,
          pipelineId: deal.pipelineId,
          stageId: deal.stageId,
          companyId: deal.companyId || '',
          contactId: deal.contactId || '',
          priority: deal.priority,
          ownerId: deal.ownerId || '',
          tags: deal.tags,
          source: deal.source || '',
        }
      : {
          name: '',
          description: '',
          value: 0,
          currency: 'USD',
          probability: 0,
          pipelineId: '',
          stageId: '',
          companyId: '',
          contactId: '',
          priority: 'medium',
          ownerId: '',
          tags: [],
          source: '',
        },
  });

  // Find and set the pipeline when pipelines load or when pipelineId changes
  useEffect(() => {
    const pipelineId = form.watch('pipelineId');
    if (pipelineId && pipelines.length > 0) {
      const pipeline = pipelines.find((p) => p._id === pipelineId);
      setSelectedPipeline(pipeline || null);
    } else if (pipelines.length > 0 && !pipelineId) {
      // Set default pipeline
      const defaultPipeline = pipelines.find((p) => p.isDefault) || pipelines[0];
      if (defaultPipeline) {
        form.setValue('pipelineId', defaultPipeline._id);
        setSelectedPipeline(defaultPipeline);
        // Set first stage as default
        if (defaultPipeline.stages.length > 0) {
          const firstStage = defaultPipeline.stages.sort((a, b) => a.order - b.order)[0];
          form.setValue('stageId', firstStage._id);
          form.setValue('probability', firstStage.probability);
        }
      }
    }
  }, [pipelines, form]);

  // Update company selector state
  const watchedCompanyId = form.watch('companyId');
  useEffect(() => {
    setSelectedCompanyId(watchedCompanyId);
    // Reset contact when company changes
    if (watchedCompanyId !== selectedCompanyId && !deal) {
      form.setValue('contactId', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCompanyId]);

  const handlePipelineChange = (pipelineId: string) => {
    const pipeline = pipelines.find((p) => p._id === pipelineId);
    if (pipeline) {
      setSelectedPipeline(pipeline);
      form.setValue('pipelineId', pipelineId);

      // Reset to first stage
      if (pipeline.stages.length > 0) {
        const firstStage = pipeline.stages.sort((a, b) => a.order - b.order)[0];
        form.setValue('stageId', firstStage._id);
        form.setValue('probability', firstStage.probability);
      }
    }
  };

  const handleStageChange = (stageId: string) => {
    const stage = selectedPipeline?.stages.find((s) => s._id === stageId);
    if (stage) {
      form.setValue('stageId', stageId);
      form.setValue('probability', stage.probability);
    }
  };

  const handleSubmit = async (data: CreateDealInput) => {
    await onSubmit(data);
  };

  const selectedContact = contacts.find((c) => c._id === form.watch('contactId'));
  const sortedStages = selectedPipeline
    ? [...selectedPipeline.stages].sort((a, b) => a.order - b.order)
    : [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Basic Information</h3>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deal Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Enterprise Sale - Acme Corp" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Brief description of the deal..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deal Value *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="50000"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="USD">USD - US Dollar</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                      <SelectItem value="GBP">GBP - British Pound</SelectItem>
                      <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                      <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="expectedCloseDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expected Close Date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    {...field}
                    value={
                      field.value instanceof Date
                        ? field.value.toISOString().split('T')[0]
                        : field.value || ''
                    }
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value) : undefined;
                      field.onChange(date);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Pipeline & Stage */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Pipeline & Stage</h3>

          <FormField
            control={form.control}
            name="pipelineId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pipeline *</FormLabel>
                <Select
                  onValueChange={handlePipelineChange}
                  defaultValue={field.value}
                  disabled={pipelinesLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select pipeline" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {pipelines.map((pipeline) => (
                      <SelectItem key={pipeline._id} value={pipeline._id}>
                        {pipeline.name}
                        {pipeline.isDefault && ' (Default)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stageId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stage *</FormLabel>
                <Select
                  onValueChange={handleStageChange}
                  defaultValue={field.value}
                  disabled={!selectedPipeline}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {sortedStages.map((stage) => (
                      <SelectItem key={stage._id} value={stage._id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="size-2 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name} ({stage.probability}%)
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Probability will be set based on the selected stage
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="probability"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Probability (%)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    disabled
                  />
                </FormControl>
                <FormDescription>Automatically set by the selected stage</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Relationships */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Relationships</h3>

          <FormField
            control={form.control}
            name="companyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company</FormLabel>
                <FormControl>
                  <CompanySelector value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormDescription>
                  Associate this deal with a company
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contactId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact</FormLabel>
                <Popover open={contactPopoverOpen} onOpenChange={setContactPopoverOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={contactPopoverOpen}
                        className="w-full justify-between"
                        disabled={!selectedCompanyId}
                      >
                        {selectedContact ? (
                          <div className="flex items-center gap-2">
                            <User className="size-4" />
                            <span>
                              {selectedContact.firstName} {selectedContact.lastName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            {selectedCompanyId
                              ? 'Select contact...'
                              : 'Select a company first'}
                          </span>
                        )}
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search contacts..."
                        value={contactSearch}
                        onValueChange={setContactSearch}
                      />
                      <CommandEmpty>No contacts found.</CommandEmpty>
                      <CommandGroup className="max-h-64 overflow-auto">
                        {contacts.map((contact) => (
                          <CommandItem
                            key={contact._id}
                            value={`${contact.firstName} ${contact.lastName}`}
                            onSelect={() => {
                              field.onChange(
                                contact._id === field.value ? undefined : contact._id
                              );
                              setContactPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 size-4',
                                field.value === contact._id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <div className="flex flex-col">
                              <span>
                                {contact.firstName} {contact.lastName}
                              </span>
                              {contact.email && (
                                <span className="text-xs text-muted-foreground">
                                  {contact.email}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  {selectedCompanyId
                    ? 'Select a contact from the company'
                    : 'Select a company first to choose a contact'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Classification */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Classification</h3>

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Website, Referral, Cold Call" {...field} />
                </FormControl>
                <FormDescription>How was this deal sourced?</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Tags & Assignment */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Tags & Assignment</h3>

          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <FormControl>
                  <TagSelector
                    value={field.value || []}
                    onChange={field.onChange}
                    entityType="deal"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ownerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Owner</FormLabel>
                <FormControl>
                  <OwnerSelector value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormDescription>Assign this deal to a team member</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-2 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {deal ? 'Update Deal' : 'Create Deal'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
