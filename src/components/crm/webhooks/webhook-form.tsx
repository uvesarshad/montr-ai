'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createWebhookSchema, type CreateWebhookInput } from '@/validations/crm/webhook.schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { X, Plus, Play } from 'lucide-react';


interface WebhookFormProps {
  webhookId?: string;
  initialData?: Partial<CreateWebhookInput>;
  onSave?: (data: CreateWebhookInput) => Promise<void>;
  onCancel?: () => void;
}

const WEBHOOK_EVENTS = [
  { value: 'contact.created', label: 'Contact Created', category: 'Contact' },
  { value: 'contact.updated', label: 'Contact Updated', category: 'Contact' },
  { value: 'contact.deleted', label: 'Contact Deleted', category: 'Contact' },
  { value: 'company.created', label: 'Company Created', category: 'Company' },
  { value: 'company.updated', label: 'Company Updated', category: 'Company' },
  { value: 'company.deleted', label: 'Company Deleted', category: 'Company' },
  { value: 'deal.created', label: 'Deal Created', category: 'Deal' },
  { value: 'deal.updated', label: 'Deal Updated', category: 'Deal' },
  { value: 'deal.deleted', label: 'Deal Deleted', category: 'Deal' },
  { value: 'deal.stage_changed', label: 'Deal Stage Changed', category: 'Deal' },
  { value: 'deal.won', label: 'Deal Won', category: 'Deal' },
  { value: 'deal.lost', label: 'Deal Lost', category: 'Deal' },
  { value: 'activity.created', label: 'Activity Created', category: 'Activity' },
  { value: 'task.completed', label: 'Task Completed', category: 'Activity' },
  { value: 'email.received', label: 'Email Received', category: 'Email' },
  { value: 'email.sent', label: 'Email Sent', category: 'Email' },
];

function EventsCard({
  eventsByCategory,
  selectedEvents,
  onToggle,
}: {
  eventsByCategory: Record<string, typeof WEBHOOK_EVENTS>;
  selectedEvents: string[];
  onToggle: (event: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Events *</CardTitle>
        <p className="text-sm text-muted-foreground">
          Select which events should trigger this webhook
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(eventsByCategory).map(([category, events]) => (
          <div key={category} className="space-y-2">
            <h4 className="text-sm font-medium">{category}</h4>
            <div className="grid grid-cols-2 gap-2">
              {events.map((event) => (
                <div key={event.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={event.value}
                    checked={selectedEvents.includes(event.value)}
                    onCheckedChange={() => onToggle(event.value)}
                  />
                  <Label htmlFor={event.value} className="text-sm font-normal cursor-pointer">
                    {event.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CustomHeadersCard({
  customHeaders,
  onUpdate,
  onRemove,
  onAdd,
}: {
  customHeaders: { key: string; value: string }[];
  onUpdate: (index: number, field: 'key' | 'value', value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Headers (Optional)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Add custom HTTP headers to the webhook request
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {customHeaders.map((header, index) => (
          <div key={`header-${index}-${header.key}`} className="flex items-center gap-2">
            <Input
              value={header.key}
              onChange={(e) => onUpdate(index, 'key', e.target.value)}
              placeholder="Header name"
            />
            <Input
              value={header.value}
              onChange={(e) => onUpdate(index, 'value', e.target.value)}
              placeholder="Header value"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(index)}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={onAdd} className="w-full">
          <Plus className="size-4 mr-2" />
          Add Header
        </Button>
      </CardContent>
    </Card>
  );
}

export function WebhookForm({ webhookId, initialData, onSave, onCancel }: WebhookFormProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<string[]>(initialData?.events || []);
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>(
    Object.entries(initialData?.headers || {}).map(([key, value]) => ({ key, value }))
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CreateWebhookInput>({
    resolver: zodResolver(createWebhookSchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      isActive: initialData?.isActive ?? true,
      url: initialData?.url || '',
      method: initialData?.method || 'POST',
      secret: initialData?.secret || '',
      maxRetries: initialData?.maxRetries ?? 3,
      retryDelaySeconds: initialData?.retryDelaySeconds ?? 60,
    },
  });

  const isActive = watch('isActive');

  const handleEventToggle = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    );
  };

  const addHeader = () => {
    setCustomHeaders([...customHeaders, { key: '', value: '' }]);
  };

  const removeHeader = (index: number) => {
    setCustomHeaders(customHeaders.filter((_, i) => i !== index));
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...customHeaders];
    newHeaders[index][field] = value;
    setCustomHeaders(newHeaders);
  };

  const onSubmit = async (formData: CreateWebhookInput) => {
    try {
      if (selectedEvents.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Validation Error',
          description: 'Please select at least one event.',
        });
        return;
      }

      setIsSaving(true);

      const headers: Record<string, string> = {};
      customHeaders.forEach(({ key, value }) => {
        if (key && value) {
          headers[key] = value;
        }
      });

      const webhookData: CreateWebhookInput = {
        ...formData,
        events: selectedEvents as CreateWebhookInput['events'],
        headers,
      };

      if (onSave) {
        await onSave(webhookData);
      } else {
        const url = webhookId
          ? `/api/v2/crm/webhooks/${webhookId}`
          : '/api/v2/crm/webhooks';
        const method = webhookId ? 'PATCH' : 'POST';

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(webhookData),
        });

        if (!response.ok) {
          throw new Error('Failed to save webhook');
        }

        toast({
          title: webhookId ? 'Webhook Updated' : 'Webhook Created',
          description: `The webhook has been ${webhookId ? 'updated' : 'created'} successfully.`,
        });

        onCancel?.();
      }
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save webhook. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!webhookId) return;

    setIsTesting(true);
    try {
      const testEvent = selectedEvents.length > 0 ? selectedEvents[0] : 'webhook.test';

      const response = await fetch(`/api/v2/crm/webhooks/${webhookId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: testEvent
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to test webhook');
      }

      toast({
        title: 'Test Sent',
        description: 'The test webhook payload has been sent successfully.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'Failed to trigger test webhook.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const eventsByCategory = WEBHOOK_EVENTS.reduce((acc, event) => {
    if (!acc[event.category]) {
      acc[event.category] = [];
    }
    acc[event.category].push(event);
    return acc;
  }, {} as Record<string, typeof WEBHOOK_EVENTS>);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Zapier Integration"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Describe what this webhook does..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">Webhook URL *</Label>
            <Input
              id="url"
              {...register('url')}
              placeholder="https://hooks.zapier.com/..."
              type="url"
            />
            {errors.url && (
              <p className="text-sm text-destructive">{errors.url.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="method">Method</Label>
              <Select defaultValue="POST" {...register('method')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secret">Secret (Optional)</Label>
              <Input
                id="secret"
                {...register('secret')}
                type="password"
                placeholder="For signature verification"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="isActive">Active</Label>
              <p className="text-sm text-muted-foreground">
                Enable this webhook to start receiving events
              </p>
            </div>
            <Switch id="isActive" {...register('isActive')} defaultChecked={isActive} />
          </div>
        </CardContent>
      </Card>

      <EventsCard
        eventsByCategory={eventsByCategory}
        selectedEvents={selectedEvents}
        onToggle={handleEventToggle}
      />

      <CustomHeadersCard
        customHeaders={customHeaders}
        onUpdate={updateHeader}
        onRemove={removeHeader}
        onAdd={addHeader}
      />

      <Card>
        <CardHeader>
          <CardTitle>Retry Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maxRetries">Max Retries</Label>
            <Input
              id="maxRetries"
              type="number"
              {...register('maxRetries', { valueAsNumber: true })}
              min="0"
              max="10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retryDelaySeconds">Retry Delay (Seconds)</Label>
            <Input
              id="retryDelaySeconds"
              type="number"
              {...register('retryDelaySeconds', { valueAsNumber: true })}
              min="0"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          {webhookId && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleTest}
              disabled={isTesting || isSaving}
            >
              <Play className="size-4 mr-2" />
              {isTesting ? 'Sending...' : 'Test Webhook'}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : webhookId ? 'Update Webhook' : 'Create Webhook'}
          </Button>
        </div>
      </div>
    </form>
  );
}
