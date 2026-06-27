'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePipelines } from '@/hooks/crm/use-pipelines';
import { CompanySelector } from '@/components/crm/shared/company-selector';
import { OwnerSelector } from '@/components/crm/shared/owner-selector';

interface AddDealButtonProps {
  pipelineId?: string;
  stageId?: string;
  onSuccess?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children?: React.ReactNode;
}

export function AddDealButton({
  pipelineId,
  stageId,
  onSuccess,
  variant = 'default',
  size = 'default',
  children,
}: AddDealButtonProps) {
  const { push } = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { pipelines } = usePipelines({ isActive: true });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    value: '',
    currency: 'USD',
    pipelineId: pipelineId || '',
    stageId: stageId || '',
    companyId: undefined as string | undefined,
    ownerId: undefined as string | undefined,
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Please enter a deal name');
      return;
    }

    if (!formData.pipelineId) {
      toast.error('Please select a pipeline');
      return;
    }

    // Get selected pipeline
    const selectedPipeline = pipelines.find((p) => p._id === formData.pipelineId);
    if (!selectedPipeline) {
      toast.error('Invalid pipeline selected');
      return;
    }

    // Use first stage if no stage selected
    const selectedStageId =
      formData.stageId || selectedPipeline.stages[0]?._id;

    if (!selectedStageId) {
      toast.error('Pipeline has no stages');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v2/crm/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          value: formData.value ? parseFloat(formData.value) : 0,
          currency: formData.currency,
          pipelineId: formData.pipelineId,
          stageId: selectedStageId,
          companyId: formData.companyId,
          ownerId: formData.ownerId,
          priority: formData.priority,
          status: 'open',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create deal');
      }

      const deal = await response.json();
      toast.success('Deal created successfully');
      setOpen(false);
      setFormData({
        name: '',
        description: '',
        value: '',
        currency: 'USD',
        pipelineId: pipelineId || '',
        stageId: stageId || '',
        companyId: undefined,
        ownerId: undefined,
        priority: 'medium',
      });

      if (onSuccess) {
        onSuccess();
      } else {
        // Navigate to deal detail page
        push(`/crm/deals/${deal._id}`);
      }
    } catch (error) {
      console.error('Error creating deal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create deal');
    } finally {
      setLoading(false);
    }
  };

  const selectedPipeline = pipelines.find((p) => p._id === formData.pipelineId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant={variant} size={size}>
            <Plus className="size-4 mr-2" />
            Add Deal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Deal</DialogTitle>
            <DialogDescription>
              Add a new deal to your pipeline. Click save when you are done.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Deal Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">
                Deal Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter deal name"
                required
              />
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Enter deal description"
                rows={3}
              />
            </div>

            {/* Value and Currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="value">Value</Label>
                <Input
                  id="value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) =>
                    setFormData({ ...formData, currency: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="AUD">AUD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pipeline and Stage */}
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pipeline">
                  Pipeline <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.pipelineId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, pipelineId: value, stageId: '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((pipeline) => (
                      <SelectItem key={pipeline._id} value={pipeline._id}>
                        {pipeline.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPipeline && selectedPipeline.stages.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="stage">Stage</Label>
                  <Select
                    value={formData.stageId}
                    onValueChange={(value) =>
                      setFormData({ ...formData, stageId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select stage (first stage by default)" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedPipeline.stages.map((stage) => (
                        <SelectItem key={stage._id} value={stage._id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Company */}
            <div className="grid gap-2">
              <Label htmlFor="company">Company</Label>
              <CompanySelector
                value={formData.companyId}
                onChange={(value) => setFormData({ ...formData, companyId: value })}
              />
            </div>

            {/* Priority */}
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: 'low' | 'medium' | 'high' | 'urgent') =>
                  setFormData({ ...formData, priority: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Owner */}
            <div className="grid gap-2">
              <Label htmlFor="owner">Owner</Label>
              <OwnerSelector
                value={formData.ownerId}
                onChange={(value) => setFormData({ ...formData, ownerId: value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create Deal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
