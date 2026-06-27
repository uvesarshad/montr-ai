'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { UserPlus, UserMinus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Chip, EmptyState, SearchInput } from '@/components/ui-kit';

interface Contact {
  _id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

interface GroupContactsManagerProps {
  groupId: string;
  groupName: string;
  accountId?: string;
}

export function GroupContactsManager({
  groupId,
  groupName,
  accountId,
}: GroupContactsManagerProps) {
  const [groupContacts, setGroupContacts] = useState<Contact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch group contacts
  const fetchGroupContacts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/whatsapp/groups/${groupId}/contacts`);
      const data = await response.json();

      if (response.ok) {
        setGroupContacts(data.data || []);
      } else {
        toast.error('Failed to fetch group contacts');
      }
    } catch (error) {
      toast.error('Error fetching contacts');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  // Fetch all contacts for adding
  const fetchAllContacts = useCallback(async () => {
    try {
      const url = accountId
        ? `/api/whatsapp/contacts?accountId=${accountId}&limit=1000`
        : '/api/whatsapp/contacts?limit=1000';

      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        // Filter out contacts already in the group
        const groupContactIds = groupContacts.map((c) => c._id);
        const availableContacts = (data.data || []).filter(
          (contact: Contact) => !groupContactIds.includes(contact._id)
        );
        setAllContacts(availableContacts);
      } else {
        toast.error('Failed to fetch contacts');
      }
    } catch (error) {
      toast.error('Error fetching contacts');
      console.error(error);
    }
  }, [accountId, groupContacts]);

  // Add contacts to group
  const handleAddContacts = async () => {
    if (selectedContacts.length === 0) {
      toast.error('Please select at least one contact');
      return;
    }

    try {
      const response = await fetch(`/api/whatsapp/groups/${groupId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: selectedContacts,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(
          `Successfully added ${data.data.addedCount} contact(s) to the group`
        );
        setIsAddDialogOpen(false);
        setSelectedContacts([]);
        fetchGroupContacts();
      } else {
        toast.error(data.error || 'Failed to add contacts');
      }
    } catch (error) {
      toast.error('Error adding contacts');
      console.error(error);
    }
  };

  // Remove contact from group
  const handleRemoveContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to remove this contact from the group?')) {
      return;
    }

    try {
      const response = await fetch(
        `/api/whatsapp/groups/${groupId}/contacts?contactIds=${contactId}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success('Contact removed from group');
        fetchGroupContacts();
      } else {
        toast.error(data.error || 'Failed to remove contact');
      }
    } catch (error) {
      toast.error('Error removing contact');
      console.error(error);
    }
  };

  // Toggle contact selection
  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  // Filter contacts by search query
  const filteredContacts = allContacts.filter((contact) => {
    const fullName = `${contact.firstName} ${contact.lastName || ''}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    return (
      fullName.includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.phone?.includes(query)
    );
  });

  // Load group contacts on mount
  useEffect(() => {
    fetchGroupContacts();
  }, [fetchGroupContacts]);

  // Load all contacts when dialog opens
  useEffect(() => {
    if (isAddDialogOpen) {
      fetchAllContacts();
    }
  }, [isAddDialogOpen, fetchAllContacts]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Group: {groupName}</h3>
          <p className="text-sm text-muted-foreground">
            {groupContacts.length} contacts in this group
          </p>
        </div>
        <Button icon={UserPlus} onClick={() => setIsAddDialogOpen(true)}>
          Add Contacts
        </Button>
      </div>

      {/* Contacts List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading contacts...
        </div>
      ) : groupContacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          note="Add contacts to this group to start sending targeted campaigns"
          cta={
            <Button icon={UserPlus} size="sm" onClick={() => setIsAddDialogOpen(true)}>
              Add Contacts
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {groupContacts.map((contact) => (
            <div
              key={contact._id}
              className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <div className="flex-1">
                <div className="font-medium">
                  {contact.firstName} {contact.lastName}
                </div>
                <div className="text-sm text-muted-foreground">
                  {contact.email && <span>{contact.email}</span>}
                  {contact.email && contact.phone && <span className="mx-2">•</span>}
                  {contact.phone && <span>{contact.phone}</span>}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={UserMinus}
                onClick={() => handleRemoveContact(contact._id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add Contacts Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Add Contacts to {groupName}</DialogTitle>
            <DialogDescription>
              Select contacts to add to this group
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <SearchInput
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Selected Count */}
          {selectedContacts.length > 0 && (
            <Chip tone="info">
              {selectedContacts.length} contact(s) selected
            </Chip>
          )}

          {/* Contacts List */}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? 'No contacts found' : 'All contacts are already in this group'}
              </div>
            ) : (
              filteredContacts.map((contact) => (
                <div
                  key={contact._id}
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-x-3 p-3 border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => toggleContactSelection(contact._id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleContactSelection(contact._id); } }}
                >
                  <Checkbox
                    checked={selectedContacts.includes(contact._id)}
                    onCheckedChange={() => toggleContactSelection(contact._id)}
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      {contact.firstName} {contact.lastName}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {contact.email && <span>{contact.email}</span>}
                      {contact.email && contact.phone && (
                        <span className="mx-2">•</span>
                      )}
                      {contact.phone && <span>{contact.phone}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setSelectedContacts([]);
                setSearchQuery('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddContacts}
              disabled={selectedContacts.length === 0}
            >
              Add {selectedContacts.length > 0 && `(${selectedContacts.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
