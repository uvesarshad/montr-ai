'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Send, Target, Clock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Button,
  Card,
  Chip,
  Field,
  Input,
  Select,
  Stepper,
  Textarea,
} from '@/components/ui-kit';

interface TemplateComponent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface Template {
  _id: string;
  name: string;
  language: string;
  status: string;
  components?: TemplateComponent[];
}

interface ContactGroup {
  _id: string;
  name: string;
  contactCount: number;
}

interface EnhancedCampaignFormProps {
  accountId: string;
  onSuccess?: (campaignId: string) => void;
}

export function EnhancedCampaignForm({
  accountId,
  onSuccess,
}: EnhancedCampaignFormProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState({
    name: '',
    targetType: 'all',
    targetGroups: [] as string[],
    messageType: 'template',
    templateId: '',
    templateVariables: {} as Record<string, string>,
    content: '',
    scheduledAt: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    batchSize: 100,
  });

  // Fetch templates
  const fetchTemplates = async () => {
    try {
      const response = await fetch(`/api/whatsapp/templates?accountId=${accountId}&status=APPROVED`);
      const data = await response.json();
      if (response.ok) {
        setTemplates(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  // Fetch groups
  const fetchGroups = async () => {
    try {
      const response = await fetch(`/api/whatsapp/groups?accountId=${accountId}`);
      const data = await response.json();
      if (response.ok) {
        setGroups(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  // Get template variables
  const getTemplateVariables = (templateId: string): string[] => {
    const template = templates.find((t) => t._id === templateId);
    if (!template?.components) return [];

    const bodyComponent = template.components.find((c: TemplateComponent) => c.type === 'BODY');
    if (!bodyComponent?.text) return [];

    // Extract {{1}}, {{2}}, etc.
    const matches = bodyComponent.text.match(/\{\{(\d+)\}\}/g);
    return matches || [];
  };

  // Create campaign
  const handleCreateCampaign = async () => {
    if (!formData.name.trim()) {
      toast.error('Campaign name is required');
      return;
    }

    if (formData.messageType === 'template' && !formData.templateId) {
      toast.error('Please select a template');
      return;
    }

    if (formData.messageType === 'text' && !formData.content.trim()) {
      toast.error('Message content is required');
      return;
    }

    if (formData.targetType === 'groups' && formData.targetGroups.length === 0) {
      toast.error('Please select at least one group');
      return;
    }

    setLoading(true);
    try {
      // Create campaign
      const campaignPayload: Record<string, unknown> = {
        accountId,
        name: formData.name,
        targetType: formData.targetType,
        messageType: formData.messageType,
        batchSize: formData.batchSize,
      };

      if (formData.targetType === 'groups') {
        campaignPayload.targetGroups = formData.targetGroups;
      }

      if (formData.messageType === 'template') {
        campaignPayload.templateId = formData.templateId;
        if (Object.keys(formData.templateVariables).length > 0) {
          campaignPayload.templateVariables = formData.templateVariables;
        }
      } else if (formData.messageType === 'text') {
        campaignPayload.content = formData.content;
      }

      if (formData.scheduledAt) {
        campaignPayload.scheduledAt = new Date(formData.scheduledAt).toISOString();
        campaignPayload.timezone = formData.timezone;
      }

      const response = await fetch('/api/whatsapp/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignPayload),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Campaign created successfully');

        // Optionally start the campaign immediately
        if (!formData.scheduledAt) {
          await startCampaign(data.data._id);
        }

        onSuccess?.(data.data._id);
      } else {
        toast.error(data.error || 'Failed to create campaign');
      }
    } catch (error) {
      toast.error('Error creating campaign');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Start campaign
  const startCampaign = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/whatsapp/campaigns/${campaignId}/start`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Campaign started successfully');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to start campaign');
      }
    } catch (error) {
      console.error('Error starting campaign:', error);
    }
  };

  // Toggle group selection
  const toggleGroup = (groupId: string) => {
    setFormData((prev) => ({
      ...prev,
      targetGroups: prev.targetGroups.includes(groupId)
        ? prev.targetGroups.filter((id) => id !== groupId)
        : [...prev.targetGroups, groupId],
    }));
  };

  // Load data on mount
  useEffect(() => {
    fetchTemplates();
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <Stepper
        steps={['Details', 'Audience', 'Schedule']}
        current={step - 1}
      />

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <Card title="Campaign Details" meta="Basic information about your campaign">
          <div className="space-y-4 p-4">
            <Field label="Campaign Name" required htmlFor="name">
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Summer Sale Campaign"
              />
            </Field>

            <Field label="Message Type" required>
              <Select
                value={formData.messageType}
                onChange={(value) => setFormData({ ...formData, messageType: value })}
                options={[
                  { value: 'template', label: 'Template Message' },
                  { value: 'text', label: 'Text Message' },
                ]}
              />
            </Field>

            {formData.messageType === 'template' && (
              <Field
                label="Select Template"
                required
                hint={
                  templates.length === 0
                    ? 'No approved templates found. Create and get approval first.'
                    : undefined
                }
              >
                <Select
                  value={formData.templateId}
                  onChange={(value) => {
                    if (value) {
                      const variables = getTemplateVariables(value);
                      const templateVars: Record<string, string> = {};
                      variables.forEach((v, index) => {
                        templateVars[`var${index + 1}`] = '';
                      });
                      setFormData({ ...formData, templateId: value, templateVariables: templateVars });
                    } else {
                      setFormData({ ...formData, templateId: value });
                    }
                  }}
                  placeholder="Choose a template"
                  options={templates.map((template) => ({
                    value: template._id,
                    label: `${template.name} (${template.language})`,
                  }))}
                />
              </Field>
            )}

            {formData.messageType === 'text' && (
              <Field label="Message Content" required htmlFor="content">
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter your message..."
                  rows={4}
                />
              </Field>
            )}

            {/* Template Variables */}
            {formData.messageType === 'template' &&
              formData.templateId &&
              Object.keys(formData.templateVariables).length > 0 && (
                <div className="space-y-3">
                  <div className="text-[12.5px] font-medium text-foreground">Template Variables</div>
                  {Object.entries(formData.templateVariables).map(([key, value], index) => (
                    <Field key={key} label={`Variable ${index + 1}`} htmlFor={key}>
                      <Input
                        id={key}
                        value={value}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            templateVariables: {
                              ...formData.templateVariables,
                              [key]: e.target.value,
                            },
                          })
                        }
                        placeholder={`Value for {{${index + 1}}}`}
                      />
                    </Field>
                  ))}
                </div>
              )}

            <Button variant="brand" onClick={() => setStep(2)} className="w-full">
              Next: Target Audience
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Target Audience */}
      {step === 2 && (
        <Card
          icon={Target}
          title="Target Audience"
          meta="Choose who will receive this campaign"
        >
          <div className="space-y-4 p-4">
            <Field label="Targeting Type" required>
              <Select
                value={formData.targetType}
                onChange={(value) =>
                  setFormData({ ...formData, targetType: value, targetGroups: [] })
                }
                options={[
                  { value: 'all', label: 'All Contacts' },
                  { value: 'groups', label: 'Specific Groups' },
                  { value: 'individual', label: 'Individual Contacts' },
                ]}
              />
            </Field>

            {formData.targetType === 'groups' && (
              <div className="space-y-2">
                <div className="text-[12.5px] font-medium text-foreground">Select Groups *</div>
                {groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No groups found. Create groups first.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {groups.map((group) => (
                      <div
                        key={group._id}
                        className="flex items-center gap-x-3 rounded-lg border border-border p-3 hover:bg-muted/60 cursor-pointer"
                        onClick={() => toggleGroup(group._id)}
                      >
                        <Checkbox
                          checked={formData.targetGroups.includes(group._id)}
                          onCheckedChange={() => toggleGroup(group._id)}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{group.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {group.contactCount} contacts
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {formData.targetGroups.length > 0 && (
                  <Chip tone="brand">
                    {formData.targetGroups.length} group(s) selected
                  </Chip>
                )}
              </div>
            )}

            {formData.targetType === 'individual' && (
              <p className="text-sm text-muted-foreground">
                Individual contact selection will be available in the next step
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Back
              </Button>
              <Button variant="brand" onClick={() => setStep(3)} className="flex-1">
                Next: Schedule
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Schedule */}
      {step === 3 && (
        <Card
          icon={Clock}
          title="Schedule Campaign"
          meta="Choose when to send this campaign"
        >
          <div className="space-y-4 p-4">
            <Field
              label="Send Time (Optional)"
              htmlFor="scheduledAt"
              hint="Leave empty to send immediately"
            >
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
              />
            </Field>

            <Field
              label="Timezone"
              htmlFor="timezone"
              hint={`Current: ${formData.timezone}`}
            >
              <Input
                id="timezone"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                placeholder="e.g., America/New_York"
              />
            </Field>

            <Field
              label="Batch Size"
              htmlFor="batchSize"
              hint="Messages sent per batch (1 minute delay between batches)"
            >
              <Input
                id="batchSize"
                type="number"
                value={formData.batchSize}
                onChange={(e) =>
                  setFormData({ ...formData, batchSize: parseInt(e.target.value) || 100 })
                }
                min={1}
                max={1000}
              />
            </Field>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                Back
              </Button>
              <Button
                variant="brand"
                icon={Send}
                onClick={handleCreateCampaign}
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Creating...' : formData.scheduledAt ? 'Schedule Campaign' : 'Start Campaign'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
