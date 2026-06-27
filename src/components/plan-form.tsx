'use client';

import React from 'react';
import { useForm, useFieldArray, type FieldArrayWithId } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, PlusCircle, Loader2 } from 'lucide-react';
// import {
//   addDocumentNonBlocking,
//   updateDocumentNonBlocking,
//   useFirestore,
// } from '@/firebase';
// import { collection, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

const planSchema = z.object({
  name: z.string().min(1, 'Internal name is required'),
  displayName: z.string().min(1, 'Display name is required'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price must be 0 or more'),
  currency: z.string().min(2, 'Currency code is required').default('USD'),
  billingInterval: z.enum(['monthly', 'yearly', 'lifetime']),
  status: z.enum(['active', 'archived']),
  features: z
    .array(z.object({ key: z.string(), value: z.boolean() }))
    .optional(),
  limits: z
    .array(z.object({ key: z.string(), value: z.coerce.number() }))
    .optional(),
  allowedModels: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .optional(),
});

type PlanFormValues = z.infer<typeof planSchema>;

interface ExistingPlan {
  id?: string;
  _id?: string;
  features?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  allowedModels?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PlanFormProps {
  existingPlan?: ExistingPlan;
  onSave?: () => void;
  onCancel?: () => void;
}

export function PlanForm({ existingPlan, onSave, onCancel }: PlanFormProps) {
  // const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);

  const defaultValues: Partial<PlanFormValues> = existingPlan
    ? {
      ...(existingPlan as unknown as Partial<PlanFormValues>),
      features: Object.entries(existingPlan.features || {}).map(
        ([key, value]) => ({ key, value: !!value })
      ),
      limits: Object.entries(existingPlan.limits || {}).map(
        ([key, value]) => ({ key, value: Number(value) })
      ),
      allowedModels: Object.entries(existingPlan.allowedModels || {}).map(
        ([key, value]) => ({ key, value: (value as string[]).join(', ') })
      ),
    }
    : {
      name: '',
      displayName: '',
      price: 0,
      currency: 'USD',
      billingInterval: 'monthly',
      status: 'active',
      features: [],
      limits: [],
      allowedModels: [],
    };

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues,
  });

  const {
    fields: featureFields,
    append: appendFeature,
    remove: removeFeature,
  } = useFieldArray({ control: form.control, name: 'features' });
  const {
    fields: limitFields,
    append: appendLimit,
    remove: removeLimit,
  } = useFieldArray({ control: form.control, name: 'limits' });
  const {
    fields: modelFields,
    append: appendModel,
    remove: removeModel,
  } = useFieldArray({ control: form.control, name: 'allowedModels' });

  async function onSubmit(values: PlanFormValues) {
    setIsSaving(true);
    const planData = {
      ...values,
      description: values.description || '',
      features: values.features?.reduce(
        (acc, { key, value }) => ({ ...acc, [key]: value }),
        {}
      ) || {},
      limits: values.limits?.reduce(
        (acc, { key, value }) => ({ ...acc, [key]: value }),
        {}
      ) || {},
      allowedModels: values.allowedModels?.reduce(
        (acc, { key, value }) => ({ ...acc, [key]: value.split(',').map(s => s.trim()) }),
        {}
      ) || {},
    };

    try {
      if (existingPlan) {
        const res = await fetch(`/api/v2/admin/plans?planId=${existingPlan.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(planData)
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update plan');
        }
        toast({ title: 'Plan Updated', description: `${values.displayName} has been updated.` });
      } else {
        const res = await fetch('/api/v2/admin/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(planData)
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create plan');
        }
        toast({ title: 'Plan Created', description: `${values.displayName} has been successfully created.` });
      }
      onSave?.();
    } catch (error: unknown) {
      console.error('Failed to save plan:', error);
      toast({ variant: 'destructive', title: 'Save Failed', description: error instanceof Error ? error.message : 'Failed to save plan' });
    } finally {
      setIsSaving(false);
    }
  }

  const renderArrayField = (
    title: string,
    fields: FieldArrayWithId<PlanFormValues, 'features' | 'limits' | 'allowedModels', 'id'>[],
    remove: (index: number) => void,
    append: (obj: { key: string; value: boolean | number | string }) => void,
    valueType: 'switch' | 'number' | 'text',
    placeholderKey: string,
    placeholderValue: string
  ) => (
    <div className="space-y-4 rounded-md border p-4">
      <h3 className="font-semibold">{title}</h3>
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <FormField
            control={form.control}
            name={`${title.toLowerCase()}.${index}.key` as 'features.0.key' | 'limits.0.key' | 'allowedModels.0.key'}
            render={({ field }) => (
              <Input {...field} placeholder={placeholderKey} className="flex-1" />
            )}
          />
          {valueType === 'switch' && (
            <FormField
              control={form.control}
              name={`${title.toLowerCase()}.${index}.value` as 'features.0.value' | 'limits.0.value' | 'allowedModels.0.value'}
              render={({ field }) => (
                <Switch checked={field.value as boolean} onCheckedChange={field.onChange} />
              )}
            />
          )}
          {valueType === 'number' && (
            <FormField
              control={form.control}
              name={`${title.toLowerCase()}.${index}.value` as 'features.0.value' | 'limits.0.value' | 'allowedModels.0.value'}
              render={({ field }) => (
                <Input
                  {...field}
                  value={field.value as string | number}
                  type="number"
                  placeholder={placeholderValue}
                  className="w-24"
                />
              )}
            />
          )}
          {valueType === 'text' && (
            <FormField
              control={form.control}
              name={`${title.toLowerCase()}.${index}.value` as 'features.0.value' | 'limits.0.value' | 'allowedModels.0.value'}
              render={({ field }) => (
                <Input
                  {...field}
                  value={field.value as string}
                  placeholder={placeholderValue}
                  className="flex-1"
                />
              )}
            />
          )}
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={() => remove(index)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => append(valueType === 'switch' ? { key: '', value: true } : { key: '', value: '' })}
      >
        <PlusCircle className="mr-2 size-4" /> Add {title.slice(0, -1)}
      </Button>
    </div>
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., Pro Plan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Name</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., pro-monthly" {...field} />
                  </FormControl>
                  <FormDescription>
                    Used for internal identification (e.g., in Stripe).
                  </FormDescription>
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
                    <Textarea placeholder="Describe the plan..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="19.99" {...field} />
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
                    <FormControl>
                      <Input placeholder="USD" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="billingInterval"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Interval</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select interval" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                        <SelectItem value="lifetime">Lifetime</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
          <div className="space-y-4">
            {renderArrayField('Features', featureFields, removeFeature, appendFeature as (obj: { key: string; value: boolean | number | string }) => void, 'switch', 'Feature Key (e.g., canUseApi)', '')}
            {renderArrayField('Limits', limitFields, removeLimit, appendLimit as (obj: { key: string; value: boolean | number | string }) => void, 'number', 'Limit Key (e.g., maxCanvases)', 'Value')}
            {renderArrayField('AllowedModels', modelFields, removeModel, appendModel as (obj: { key: string; value: boolean | number | string }) => void, 'text', 'Provider (e.g., openai)', 'Model IDs (comma-separated)')}
          </div>
        </div>

        <div className="flex justify-end gap-4">
          {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save Plan
          </Button>
        </div>
      </form>
    </Form>
  );
}
