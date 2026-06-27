'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { FlaskConical, X, UserCheck } from 'lucide-react';
import { Banner, Button, Chip, Field, Input } from '@/components/ui-kit';

interface Contact {
  _id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
}

interface CampaignTestDialogProps {
  campaignId: string;
  campaignName: string;
  accountId: string;
}

export function CampaignTestDialog({
  campaignId,
  campaignName,
  accountId: _accountId,
}: CampaignTestDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  // Search contacts
  const searchContacts = async () => {
    if (!searchQuery.trim()) {
      toast.error('Enter a search term');
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(
        `/api/whatsapp/contacts?search=${encodeURIComponent(searchQuery)}&limit=10`
      );
      const data = await response.json();

      if (response.ok) {
        setContacts(data.data || []);
        if (data.data.length === 0) {
          toast.info('No contacts found');
        }
      } else {
        toast.error(data.error || 'Failed to search contacts');
      }
    } catch (error) {
      toast.error('Error searching contacts');
      console.error(error);
    } finally {
      setSearchLoading(false);
    }
  };

  // Toggle contact selection
  const toggleContact = (contactId: string) => {
    setSelectedContacts((prev) => {
      if (prev.includes(contactId)) {
        return prev.filter((id) => id !== contactId);
      } else {
        if (prev.length >= 10) {
          toast.error('Maximum 10 test contacts allowed');
          return prev;
        }
        return [...prev, contactId];
      }
    });
  };

  // Remove contact
  const removeContact = (contactId: string) => {
    setSelectedContacts((prev) => prev.filter((id) => id !== contactId));
  };

  // Send test messages
  const sendTestMessages = async () => {
    if (selectedContacts.length === 0) {
      toast.error('Select at least one test contact');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/whatsapp/campaigns/${campaignId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testContacts: selectedContacts,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Test messages sent to ${data.data.testContacts} contact(s)`);
        setOpen(false);
        setSelectedContacts([]);
        setContacts([]);
        setSearchQuery('');
      } else {
        toast.error(data.error || 'Failed to send test messages');
      }
    } catch (error) {
      toast.error('Error sending test messages');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const selectedContactData = contacts.filter((c) => selectedContacts.includes(c._id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" icon={FlaskConical}>
          Test Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Test Campaign</DialogTitle>
          <DialogDescription>
            Send test messages to up to 10 contacts before launching <strong>{campaignName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Contacts */}
          <Field label="Search Contacts" htmlFor="search">
            <div className="flex gap-2">
              <Input
                id="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, phone, or email..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    searchContacts();
                  }
                }}
                wrapClassName="flex-1"
              />
              <Button
                onClick={searchContacts}
                disabled={searchLoading}
                variant="outline"
                size="sm"
              >
                {searchLoading ? 'Searching…' : 'Search'}
              </Button>
            </div>
          </Field>

          {/* Search Results */}
          {contacts.length > 0 && (
            <div>
              <p className="mb-1 text-[12.5px] font-medium text-foreground">Search Results (Select up to 10)</p>
              <div className="border border-border rounded-lg max-h-48 overflow-y-auto">
                {contacts.map((contact) => {
                  const isSelected = selectedContacts.includes(contact._id);
                  const isDisabled = !isSelected && selectedContacts.length >= 10;

                  return (
                    <div
                      key={contact._id}
                      role="button"
                      tabIndex={isDisabled ? -1 : 0}
                      className={`flex items-center gap-3 p-3 border-b border-border last:border-b-0 hover:bg-muted/50 ${
                        isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                      onClick={() => !isDisabled && toggleContact(contact._id)}
                      onKeyDown={(e) => { if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleContact(contact._id); } }}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={isDisabled}
                        onCheckedChange={() => !isDisabled && toggleContact(contact._id)}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {contact.firstName} {contact.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {contact.phoneNumber}
                          {contact.email && ` • ${contact.email}`}
                        </div>
                      </div>
                      {isSelected && (
                        <Chip tone="ok" icon={UserCheck}>Selected</Chip>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Contacts */}
          {selectedContactData.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12.5px] font-medium text-foreground">
                Selected Test Contacts ({selectedContactData.length}/10)
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedContactData.map((contact) => (
                  <Chip
                    key={contact._id}
                    tone="gray"
                    icon={UserCheck}
                    onClick={() => removeContact(contact._id)}
                  >
                    {contact.firstName} {contact.lastName}
                    <X className="ml-1 size-3 opacity-60" />
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <Banner tone="info">
            <strong>Note:</strong> Test messages will be sent immediately to the selected contacts.
            This will not affect the actual campaign.
          </Banner>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setSelectedContacts([]);
              setContacts([]);
              setSearchQuery('');
            }}
          >
            Cancel
          </Button>
          <Button variant="brand" onClick={sendTestMessages} disabled={loading || selectedContacts.length === 0}>
            {loading
              ? 'Sending…'
              : `Send to ${selectedContacts.length} contact${
                  selectedContacts.length !== 1 ? 's' : ''
                }`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
