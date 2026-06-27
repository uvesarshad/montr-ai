'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Users, Edit, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Textarea,
} from '@/components/ui-kit';

interface ContactGroup {
  _id: string;
  name: string;
  description?: string;
  contactCount: number;
  createdAt: string;
}

interface ContactGroupManagerProps {
  accountId?: string;
  onGroupSelect?: (groupId: string) => void;
}

interface GroupCardProps {
  group: ContactGroup;
  onSelect?: (groupId: string) => void;
  onEdit: (group: ContactGroup) => void;
  onDelete: (groupId: string) => void;
}

function GroupCard({ group, onSelect, onEdit, onDelete }: GroupCardProps) {
  return (
    <Card lift bodyClassName="cursor-pointer p-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect?.(group._id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(group._id); } }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{group.name}</div>
            {group.description && (
              <div className="mt-1 text-[12.5px] text-muted-foreground">{group.description}</div>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <IconButton
              icon={Edit}
              iconSize={15}
              aria-label="Edit group"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(group);
              }}
            />
            <IconButton
              icon={Trash2}
              iconSize={15}
              aria-label="Delete group"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(group._id);
              }}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Chip tone="gray" icon={Users}>{group.contactCount} contacts</Chip>
          <Button variant="outline" size="sm" icon={UserPlus}>
            Add Contacts
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function ContactGroupManager({
  accountId,
  onGroupSelect,
}: ContactGroupManagerProps) {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ContactGroup | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  // Fetch groups
  const fetchGroups = async () => {
    setLoading(true);
    try {
      const url = accountId
        ? `/api/whatsapp/groups?accountId=${accountId}`
        : '/api/whatsapp/groups';

      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        setGroups(data.data || []);
      } else {
        toast.error('Failed to fetch groups');
      }
    } catch (error) {
      toast.error('Error fetching groups');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Create group
  const handleCreateGroup = async () => {
    if (!formData.name.trim()) {
      toast.error('Group name is required');
      return;
    }

    try {
      const response = await fetch('/api/whatsapp/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          accountId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Group created successfully');
        setIsCreateDialogOpen(false);
        setFormData({ name: '', description: '' });
        fetchGroups();
      } else {
        toast.error(data.error || 'Failed to create group');
      }
    } catch (error) {
      toast.error('Error creating group');
      console.error(error);
    }
  };

  // Update group
  const handleUpdateGroup = async () => {
    if (!selectedGroup || !formData.name.trim()) {
      toast.error('Group name is required');
      return;
    }

    try {
      const response = await fetch(`/api/whatsapp/groups/${selectedGroup._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Group updated successfully');
        setIsEditDialogOpen(false);
        setSelectedGroup(null);
        setFormData({ name: '', description: '' });
        fetchGroups();
      } else {
        toast.error(data.error || 'Failed to update group');
      }
    } catch (error) {
      toast.error('Error updating group');
      console.error(error);
    }
  };

  // Delete group
  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group?')) {
      return;
    }

    try {
      const response = await fetch(`/api/whatsapp/groups/${groupId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Group deleted successfully');
        fetchGroups();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete group');
      }
    } catch (error) {
      toast.error('Error deleting group');
      console.error(error);
    }
  };

  // Open edit dialog
  const openEditDialog = (group: ContactGroup) => {
    setSelectedGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
    });
    setIsEditDialogOpen(true);
  };

  // Load groups on mount
  useState(() => {
    fetchGroups();
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Contact Groups</h2>
          <p className="text-[13px] text-muted-foreground">
            Organize your contacts into groups for targeted campaigns
          </p>
        </div>
        <Button size="sm" icon={Plus} onClick={() => setIsCreateDialogOpen(true)}>
          Create Group
        </Button>
      </div>

      {/* Groups Grid */}
      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Loading groups...</div>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No groups yet"
            note="Create your first group to start organizing contacts."
            cta={
              <Button size="sm" icon={Plus} onClick={() => setIsCreateDialogOpen(true)}>
                Create First Group
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <GroupCard
              key={group._id}
              group={group}
              onSelect={onGroupSelect}
              onEdit={openEditDialog}
              onDelete={handleDeleteGroup}
            />
          ))}
        </div>
      )}

      {/* Create Group Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Contact Group</DialogTitle>
            <DialogDescription>
              Create a new group to organize your contacts for targeted campaigns
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Group Name" required htmlFor="name">
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., VIP Customers, Newsletter Subscribers"
              />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description for this group"
                rows={3}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateGroup}>Create Group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact Group</DialogTitle>
            <DialogDescription>
              Update the group name and description
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Group Name" required htmlFor="edit-name">
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., VIP Customers, Newsletter Subscribers"
              />
            </Field>
            <Field label="Description" htmlFor="edit-description">
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description for this group"
                rows={3}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateGroup}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
