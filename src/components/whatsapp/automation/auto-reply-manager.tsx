'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Textarea,
} from '@/components/ui-kit';

interface AutoReply {
  _id: string;
  name: string;
  triggerType: 'exact' | 'contains' | 'keyword';
  triggers: string[];
  replyMessage: string;
  enabled: boolean;
  usageCount: number;
  createdAt: string;
}

interface AutoReplyManagerProps {
  accountId: string;
}

function AutoReplyCard({
  reply,
  onToggle,
  onEdit,
  onDelete,
}: {
  reply: AutoReply;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (reply: AutoReply) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card bodyClassName="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{reply.name}</span>
            {reply.enabled ? (
              <Chip tone="ok" dot>Active</Chip>
            ) : (
              <Chip tone="gray">Inactive</Chip>
            )}
            <Chip tone="gray">{reply.usageCount || 0} uses</Chip>
          </div>
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            <strong>Trigger type:</strong>{' '}
            {reply.triggerType === 'exact' && 'Exact match'}
            {reply.triggerType === 'contains' && 'Contains text'}
            {reply.triggerType === 'keyword' && 'Keyword match'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Switch
            checked={reply.enabled}
            onCheckedChange={(checked) => onToggle(reply._id, checked)}
          />
          <IconButton icon={Edit} iconSize={15} aria-label="Edit auto reply" onClick={() => onEdit(reply)} />
          <IconButton icon={Trash2} iconSize={15} aria-label="Delete auto reply" onClick={() => onDelete(reply._id)} />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <p className="mb-1 text-[12.5px] font-medium text-muted-foreground">Triggers:</p>
          <div className="flex flex-wrap gap-1">
            {reply.triggers.map((trigger) => (
              <Chip key={trigger} tone="gray">{trigger}</Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[12.5px] font-medium text-muted-foreground">Reply:</p>
          <p className="rounded-md bg-muted p-2 text-[13px]">{reply.replyMessage}</p>
        </div>
      </div>
    </Card>
  );
}

export function AutoReplyManager({ accountId }: AutoReplyManagerProps) {
  const [autoReplies, setAutoReplies] = useState<AutoReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<AutoReply | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    triggerType: 'keyword',
    triggers: '',
    replyMessage: '',
    enabled: true,
  });

  // Fetch auto replies
  const fetchAutoReplies = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/whatsapp/auto-replies?accountId=${accountId}`);
      const data = await response.json();

      if (response.ok) {
        setAutoReplies(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching auto replies:', error);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  // Create or update auto reply
  const handleSave = async () => {
    if (!formData.name.trim() || !formData.triggers.trim() || !formData.replyMessage.trim()) {
      toast.error('All fields are required');
      return;
    }

    try {
      const triggerArray = formData.triggers.split(',').map((t) => t.trim()).filter(Boolean);

      const payload = {
        accountId,
        name: formData.name,
        triggerType: formData.triggerType,
        triggers: triggerArray,
        replyMessage: formData.replyMessage,
        enabled: formData.enabled,
      };

      const url = editingReply
        ? `/api/whatsapp/auto-replies/${editingReply._id}`
        : '/api/whatsapp/auto-replies';

      const method = editingReply ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(editingReply ? 'Auto reply updated' : 'Auto reply created');
        setIsDialogOpen(false);
        resetForm();
        fetchAutoReplies();
      } else {
        toast.error(data.error || 'Failed to save auto reply');
      }
    } catch (error) {
      toast.error('Error saving auto reply');
      console.error(error);
    }
  };

  // Delete auto reply
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this auto reply?')) {
      return;
    }

    try {
      const response = await fetch(`/api/whatsapp/auto-replies/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Auto reply deleted');
        fetchAutoReplies();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete auto reply');
      }
    } catch (error) {
      toast.error('Error deleting auto reply');
      console.error(error);
    }
  };

  // Toggle enabled status
  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/whatsapp/auto-replies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        toast.success(enabled ? 'Auto reply enabled' : 'Auto reply disabled');
        fetchAutoReplies();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to update status');
      }
    } catch (error) {
      toast.error('Error updating status');
      console.error(error);
    }
  };

  // Open edit dialog
  const openEditDialog = (reply: AutoReply) => {
    setEditingReply(reply);
    setFormData({
      name: reply.name,
      triggerType: reply.triggerType,
      triggers: reply.triggers.join(', '),
      replyMessage: reply.replyMessage,
      enabled: reply.enabled,
    });
    setIsDialogOpen(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      triggerType: 'keyword',
      triggers: '',
      replyMessage: '',
      enabled: true,
    });
    setEditingReply(null);
  };

  useEffect(() => {
    fetchAutoReplies();
  }, [fetchAutoReplies]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Automated Replies</h2>
          <p className="text-[13px] text-muted-foreground">
            Set up automatic responses to incoming messages
          </p>
        </div>
        <Button size="sm" icon={Plus} onClick={() => setIsDialogOpen(true)}>
          Create Auto Reply
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-8 text-center text-muted-foreground">
          Loading auto replies...
        </div>
      ) : autoReplies.length === 0 ? (
        <Card>
          <EmptyState
            icon={Zap}
            title="No auto replies yet"
            note="Create automated responses to engage with customers instantly."
            cta={
              <Button size="sm" icon={Plus} onClick={() => setIsDialogOpen(true)}>
                Create First Auto Reply
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {autoReplies.map((reply) => (
            <AutoReplyCard
              key={reply._id}
              reply={reply}
              onToggle={handleToggle}
              onEdit={openEditDialog}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingReply ? 'Edit Auto Reply' : 'Create Auto Reply'}
            </DialogTitle>
            <DialogDescription>
              Set up automatic responses to specific messages
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Name" required htmlFor="name">
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Welcome Message"
              />
            </Field>

            <Field
              label="Trigger Type"
              required
              hint={
                formData.triggerType === 'exact' ? 'Trigger only if message exactly matches'
                : formData.triggerType === 'contains' ? 'Trigger if message contains the text'
                : 'Trigger if any keyword is found'
              }
            >
              <Select
                value={formData.triggerType}
                onChange={(value) => setFormData({ ...formData, triggerType: value })}
                options={[
                  { value: 'exact', label: 'Exact Match' },
                  { value: 'contains', label: 'Contains Text' },
                  { value: 'keyword', label: 'Keyword Match' },
                ]}
              />
            </Field>

            <Field label="Trigger Keywords" required htmlFor="triggers" hint="Separate multiple triggers with commas">
              <Input
                id="triggers"
                value={formData.triggers}
                onChange={(e) => setFormData({ ...formData, triggers: e.target.value })}
                placeholder="hello, hi, hey (comma-separated)"
              />
            </Field>

            <Field label="Reply Message" required htmlFor="replyMessage">
              <Textarea
                id="replyMessage"
                value={formData.replyMessage}
                onChange={(e) =>
                  setFormData({ ...formData, replyMessage: e.target.value })
                }
                placeholder="Enter the automated response message..."
                rows={4}
              />
            </Field>

            <div className="flex items-center gap-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, enabled: checked })
                }
              />
              <label htmlFor="enabled" className="text-sm text-foreground cursor-pointer">Enable auto reply</label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingReply ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
