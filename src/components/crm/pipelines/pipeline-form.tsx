'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pipeline } from '@/types/crm';
import { CreatePipelineInput, createPipelineSchema } from '@/validations/crm/pipeline.schema';
import { usePipelines } from '@/hooks/crm/use-pipelines';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface PipelineFormProps {
  pipelineId?: string;
  initialData?: Pipeline;
  onCancel: () => void;
  onSuccess: () => void;
}

const defaultStages = [
  { name: 'Lead', color: 'blue', probability: 10, type: 'open' as const, order: 0 },
  { name: 'Qualified', color: 'green', probability: 25, type: 'open' as const, order: 1 },
  { name: 'Proposal', color: 'yellow', probability: 50, type: 'open' as const, order: 2 },
  { name: 'Negotiation', color: 'orange', probability: 75, type: 'open' as const, order: 3 },
  { name: 'Won', color: 'green', probability: 100, type: 'won' as const, order: 4 },
  { name: 'Lost', color: 'red', probability: 0, type: 'lost' as const, order: 5 },
];

export function PipelineForm({ pipelineId, initialData, onCancel, onSuccess }: PipelineFormProps) {
  const { createPipeline, updatePipeline } = usePipelines();
  const isEditing = !!pipelineId;

  const form = useForm<CreatePipelineInput>({
    resolver: zodResolver(createPipelineSchema),
    defaultValues: {
      name: '',
      description: '',
      isActive: true,
      isDefault: false,
      currency: 'USD',
      dealRotting: false,
      stages: defaultStages,
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        description: initialData.description || '',
        isActive: initialData.isActive,
        isDefault: initialData.isDefault,
        currency: initialData.currency,
        dealRotting: initialData.dealRotting,
        stages: initialData.stages.map(stage => ({
          _id: stage._id,
          name: stage.name,
          color: stage.color,
          probability: stage.probability,
          type: stage.type,
          order: stage.order,
          rottenDays: stage.rottenDays,
        })),
      });
    }
  }, [initialData, form]);

  const onSubmit = async (data: CreatePipelineInput) => {
    try {
      if (isEditing && pipelineId) {
        await updatePipeline(pipelineId, data);
        toast.success('Pipeline updated successfully');
      } else {
        await createPipeline(data);
        toast.success('Pipeline created successfully');
      }
      onSuccess();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : `Failed to ${isEditing ? 'update' : 'create'} pipeline`);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pipeline Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Sales Pipeline" {...field} />
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
                  placeholder="Describe this pipeline's purpose..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Optional description to help your team understand when to use this pipeline
              </FormDescription>
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
              <FormControl>
                <Input placeholder="USD" {...field} maxLength={3} />
              </FormControl>
              <FormDescription>
                3-letter currency code (e.g., USD, EUR, GBP)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Active</FormLabel>
                  <FormDescription>
                    Active pipelines can be used for deals
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Default</FormLabel>
                  <FormDescription>
                    Default pipeline for new deals
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="dealRotting"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Deal Rotting</FormLabel>
                <FormDescription>
                  Track deals that have been in a stage too long
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {!isEditing && (
          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-sm font-medium mb-2">Default Stages</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Your pipeline will be created with these default stages. You can customize them after creation.
            </p>
            <div className="flex flex-wrap gap-2">
              {defaultStages.map((stage) => (
                <div key={stage.order} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-background border">
                  <span className="text-sm">{stage.name}</span>
                  <span className="text-xs text-muted-foreground">{stage.probability}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {isEditing ? 'Update' : 'Create'} Pipeline
          </Button>
        </div>
      </form>
    </Form>
  );
}
