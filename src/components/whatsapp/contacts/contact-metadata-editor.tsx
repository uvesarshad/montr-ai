'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Settings, Bell, BellOff, Save } from 'lucide-react';
import { Banner, Button, Chip, Field, Select } from '@/components/ui-kit';

interface ContactMetadata {
  language?: string | null;
  subscriptionStatus: 'subscribed' | 'unsubscribed';
  doNotContact: boolean;
  tags?: string[];
  whatsappChannel?: Record<string, unknown>;
  lastContactedAt?: Date;
}

interface ContactMetadataEditorProps {
  contactId: string;
  contactName?: string;
  trigger?: React.ReactNode;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'fr', name: 'French' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ru', name: 'Russian' },
  { code: 'ko', name: 'Korean' },
];

export function ContactMetadataEditor({
  contactId,
  contactName,
  trigger,
}: ContactMetadataEditorProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [_metadata, setMetadata] = useState<ContactMetadata>({
    language: null,
    subscriptionStatus: 'unsubscribed',
    doNotContact: false,
    tags: [],
  });

  const [formData, setFormData] = useState({
    language: '',
    subscriptionStatus: 'subscribed' as 'subscribed' | 'unsubscribed',
    doNotContact: false,
  });

  // Fetch metadata
  const fetchMetadata = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/whatsapp/contacts/${contactId}/metadata`);
      const data = await response.json();

      if (response.ok) {
        setMetadata(data.data);
        setFormData({
          language: data.data.language || '',
          subscriptionStatus: data.data.subscriptionStatus,
          doNotContact: data.data.doNotContact,
        });
      }
    } catch (error) {
      console.error('Error fetching metadata:', error);
      toast.error('Failed to load contact settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isDialogOpen) {
      fetchMetadata();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogOpen]);

  // Handle save
  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/whatsapp/contacts/${contactId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: formData.language || undefined,
          subscriptionStatus: formData.subscriptionStatus,
          doNotContact: formData.doNotContact,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Contact settings updated successfully');
        setIsDialogOpen(false);
      } else {
        toast.error(data.error || 'Failed to update settings');
      }
    } catch (error) {
      toast.error('Error updating contact settings');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const selectedLanguage = SUPPORTED_LANGUAGES.find((lang) => lang.code === formData.language);

  return (
    <>
      {/* Trigger Button */}
      {trigger ? (
        <div role="button" tabIndex={0} onClick={() => setIsDialogOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsDialogOpen(true); } }}>{trigger}</div>
      ) : (
        <Button variant="outline" size="sm" icon={Settings} onClick={() => setIsDialogOpen(true)}>
          Settings
        </Button>
      )}

      {/* Settings Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contact Settings</DialogTitle>
            <DialogDescription>
              Manage preferences and communication settings
              {contactName && ` for ${contactName}`}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <div className="space-y-6">
              {/* Language Preference */}
              <Field
                label="Preferred Language"
                hint="AI translations will use this language for outgoing messages"
              >
                <Select
                  value={formData.language}
                  onChange={(value) => setFormData({ ...formData, language: value })}
                  placeholder="Select language…"
                  options={[
                    { value: '', label: 'Auto-detect' },
                    ...SUPPORTED_LANGUAGES.map((lang) => ({
                      value: lang.code,
                      label: lang.name,
                    })),
                  ]}
                />
              </Field>

              {/* Subscription Status */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {formData.subscriptionStatus === 'subscribed' ? (
                    <Bell className="size-4" />
                  ) : (
                    <BellOff className="size-4" />
                  )}
                  Marketing Communications
                </div>

                <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-sm">Marketing Messages</div>
                    <div className="text-xs text-muted-foreground">
                      Allow promotional campaigns and newsletters
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip tone={formData.subscriptionStatus === 'subscribed' ? 'ok' : 'gray'}>
                      {formData.subscriptionStatus === 'subscribed' ? 'Subscribed' : 'Unsubscribed'}
                    </Chip>
                    <Switch
                      checked={formData.subscriptionStatus === 'subscribed'}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          subscriptionStatus: checked ? 'subscribed' : 'unsubscribed',
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Do Not Contact */}
              <div className="space-y-3">
                <div className="text-sm font-medium">Contact Restrictions</div>

                <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-sm text-danger">
                      Do Not Contact
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Block all automated messages (campaigns, workflows, auto-replies)
                    </div>
                  </div>
                  <Switch
                    checked={formData.doNotContact}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, doNotContact: checked })
                    }
                  />
                </div>

                {formData.doNotContact && (
                  <Banner tone="warn" icon={BellOff}>
                    Manual messages can still be sent, but this contact will be excluded from all
                    automated communications.
                  </Banner>
                )}
              </div>

              {/* Current Status Summary */}
              <div className="border-t border-border pt-4">
                <div className="text-xs font-medium mb-2 text-muted-foreground">
                  Current Settings
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Language:</span>
                    <span className="font-medium">
                      {selectedLanguage ? selectedLanguage.name : 'Auto-detect'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Marketing:</span>
                    <Chip tone={formData.subscriptionStatus === 'subscribed' ? 'ok' : 'gray'}>
                      {formData.subscriptionStatus === 'subscribed' ? 'Opted In' : 'Opted Out'}
                    </Chip>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Restrictions:</span>
                    <Chip tone={formData.doNotContact ? 'danger' : 'ok'}>
                      {formData.doNotContact ? 'Blocked' : 'Allowed'}
                    </Chip>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button icon={Save} onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
