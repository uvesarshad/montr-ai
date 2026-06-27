'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface WorkflowSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  workflowId: string;
  initialData: {
    name: string;
    description?: string;
    type: 'crm' | 'whatsapp' | 'marketing_email' | 'custom';
    status: 'active' | 'paused' | 'draft';
    trigger?: {
      type: string;
      config?: Record<string, unknown>;
    };
  };
  onUpdate?: (updatedData: Record<string, unknown>) => void;
}

export function WorkflowSettingsDialog({
  open,
  onClose,
  workflowId,
  initialData,
  onUpdate,
}: WorkflowSettingsDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState(initialData);

  // Update form when initialData changes
  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }

    try {
      setIsSaving(true);

      const response = await fetch(`/api/v2/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          type: formData.type,
          status: formData.status,
          trigger: formData.trigger,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update workflow');
      }

      const data = await response.json();
      toast.success('Workflow settings updated');

      // Call onUpdate callback if provided
      if (onUpdate) {
        onUpdate(data.workflow);
      }

      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update workflow');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Workflow Settings</DialogTitle>
          <DialogDescription>
            Configure your workflow&apos;s name, type, and trigger settings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Workflow Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., Welcome New Contacts"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Describe what this workflow does..."
              rows={3}
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Workflow Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value: 'crm' | 'whatsapp' | 'marketing_email' | 'custom') =>
                setFormData({ ...formData, type: value })
              }
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="crm">CRM</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="marketing_email">Marketing Email</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500">
              The primary system this workflow interacts with
            </p>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value: 'active' | 'paused' | 'draft') =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">
                  <div>
                    <div className="font-medium">Draft</div>
                    <div className="text-xs text-gray-500">
                      Won&apos;t execute, for testing
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="active">
                  <div>
                    <div className="font-medium">Active</div>
                    <div className="text-xs text-gray-500">
                      Will execute when triggered
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="paused">
                  <div>
                    <div className="font-medium">Paused</div>
                    <div className="text-xs text-gray-500">
                      Temporarily disabled
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trigger Type */}
          <div className="space-y-2">
            <Label htmlFor="triggerType">Trigger</Label>
            <Select
              value={formData.trigger?.type || 'manual'}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  trigger: { ...formData.trigger, type: value, config: {} },
                })
              }
            >
              <SelectTrigger id="triggerType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formData.type === 'crm' && (
                  <>
                    <SelectItem value="record_created">Record Created</SelectItem>
                    <SelectItem value="record_updated">Record Updated</SelectItem>
                    <SelectItem value="deal_stage_changed">
                      Deal Stage Changed
                    </SelectItem>
                    <SelectItem value="tag_added">Tag Added</SelectItem>
                    <SelectItem value="manual">Manual Trigger</SelectItem>
                  </>
                )}
                {formData.type === 'whatsapp' && (
                  <>
                    <SelectItem value="message_received">
                      Message Received
                    </SelectItem>
                    <SelectItem value="keyword_match">Keyword Match</SelectItem>
                    <SelectItem value="campaign_sent">Campaign Sent</SelectItem>
                    <SelectItem value="manual">Manual Trigger</SelectItem>
                  </>
                )}
                {formData.type === 'marketing_email' && (
                  <>
                    <SelectItem value="email_opened">Email Opened</SelectItem>
                    <SelectItem value="email_clicked">Email Clicked</SelectItem>
                    <SelectItem value="campaign_sent">Campaign Sent</SelectItem>
                    <SelectItem value="manual">Manual Trigger</SelectItem>
                  </>
                )}
                {formData.type === 'custom' && (
                  <>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="schedule">Schedule</SelectItem>
                    <SelectItem value="manual">Manual Trigger</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500">
              The event that will trigger this workflow
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
