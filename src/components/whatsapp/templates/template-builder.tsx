'use client';

import NextImage from 'next/image';
import { useState } from 'react';
import { Input as ShadcnInput } from '@/components/ui/input';
import {
  Image as ImageIcon,
  Video,
  FileText,
  Plus,
  X,
  Phone,
  Link as LinkIcon,
  Send,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Button,
  Card,
  Chip,
  Field,
  IconButton,
  Input,
  Select,
  Textarea,
  WaPhonePreview,
} from '@/components/ui-kit';

interface TemplateBuilderProps {
  accountId: string;
  onSuccess?: (templateId: string) => void;
}

interface Button {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phoneNumber?: string;
}

interface TemplateFormData {
  name: string;
  category: string;
  language: string;
  headerType: string;
  headerText: string;
  headerMediaType: string;
  headerMediaFile: File | null;
  headerMediaUrl: string;
  body: string;
  footer: string;
  buttons: Button[];
}

interface TemplatePreviewProps {
  formData: TemplateFormData;
  headerMediaPreview: string;
}

function TemplatePreview({ formData, headerMediaPreview }: TemplatePreviewProps) {
  return (
    <div className="lg:sticky lg:top-4 h-fit">
      <Card title="Preview" meta="How your template will look">
        <div className="grid place-items-center p-4">
          <WaPhonePreview
            head={
              formData.headerType === 'TEXT' && formData.headerText
                ? formData.headerText
                : undefined
            }
            media={
              (formData.headerType === 'IMAGE' && !!headerMediaPreview) ||
              (formData.headerType === 'VIDEO' && !!formData.headerMediaFile) ||
              (formData.headerType === 'DOCUMENT' && !!formData.headerMediaFile)
            }
            body={
              <div className="whitespace-pre-wrap">
                {formData.body || 'Your message body will appear here...'}
                {formData.footer && (
                  <div className="mt-1.5 text-[11px] opacity-60">{formData.footer}</div>
                )}
              </div>
            }
            buttons={formData.buttons
              .map((btn) => btn.text || 'Button text')
              .filter(Boolean)}
          />
        </div>
      </Card>
    </div>
  );
}

export function TemplateBuilder({ accountId, onSuccess }: TemplateBuilderProps) {
  const [loading, setLoading] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    category: 'MARKETING',
    language: 'en',
    headerType: 'NONE',
    headerText: '',
    headerMediaType: '',
    headerMediaFile: null,
    headerMediaUrl: '',
    body: '',
    footer: '',
    buttons: [],
  });

  const [preview, setPreview] = useState({
    headerMediaPreview: '',
  });

  // Handle media file selection
  const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    // Validate file type
    const validTypes: Record<string, string[]> = {
      IMAGE: ['image/jpeg', 'image/png'],
      VIDEO: ['video/mp4'],
      DOCUMENT: ['application/pdf'],
    };

    if (!validTypes[formData.headerMediaType]?.includes(file.type)) {
      toast.error(`Invalid file type for ${formData.headerMediaType}`);
      return;
    }

    setFormData({ ...formData, headerMediaFile: file });

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview({ ...preview, headerMediaPreview: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  // Add button
  const addButton = (type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER') => {
    if (formData.buttons.length >= 3) {
      toast.error('Maximum 3 buttons allowed');
      return;
    }

    setFormData({
      ...formData,
      buttons: [
        ...formData.buttons,
        { type, text: '', url: '', phoneNumber: '' },
      ],
    });
  };

  // Update button
  const updateButton = (index: number, field: string, value: string) => {
    const newButtons = [...formData.buttons];
    newButtons[index] = { ...newButtons[index], [field]: value };
    setFormData({ ...formData, buttons: newButtons });
  };

  // Remove button
  const removeButton = (index: number) => {
    setFormData({
      ...formData,
      buttons: formData.buttons.filter((_, i) => i !== index),
    });
  };

  // Extract variables from body text
  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{(\d+)\}\}/g);
    return matches || [];
  };

  // Create template
  const handleCreateTemplate = async () => {
    if (!formData.name.trim() || !formData.body.trim()) {
      toast.error('Template name and body are required');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create template in database
      interface TemplateComponent {
        type: string;
        format?: string;
        text?: string;
        buttons?: unknown[];
        [key: string]: unknown;
      }
      const templatePayload: {
        accountId: string;
        name: string;
        category: string;
        language: string;
        components: TemplateComponent[];
      } = {
        accountId,
        name: formData.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        category: formData.category,
        language: formData.language,
        components: [],
      };

      // Add header component
      if (formData.headerType === 'TEXT' && formData.headerText) {
        templatePayload.components.push({
          type: 'HEADER',
          format: 'TEXT',
          text: formData.headerText,
        });
      } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(formData.headerType)) {
        templatePayload.components.push({
          type: 'HEADER',
          format: formData.headerType,
        });
      }

      // Add body component
      templatePayload.components.push({
        type: 'BODY',
        text: formData.body,
      });

      // Add footer component
      if (formData.footer) {
        templatePayload.components.push({
          type: 'FOOTER',
          text: formData.footer,
        });
      }

      // Add buttons component
      if (formData.buttons.length > 0) {
        const buttons = formData.buttons.map((btn) => {
          if (btn.type === 'QUICK_REPLY') {
            return { type: 'QUICK_REPLY', text: btn.text };
          } else if (btn.type === 'URL') {
            return { type: 'URL', text: btn.text, url: btn.url };
          } else if (btn.type === 'PHONE_NUMBER') {
            return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phoneNumber };
          }
          return btn;
        });

        templatePayload.components.push({
          type: 'BUTTONS',
          buttons,
        });
      }

      const response = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templatePayload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create template');
      }

      const templateId = data.data._id;

      // Step 2: Upload media if present
      if (formData.headerMediaFile && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(formData.headerType)) {
        await uploadMedia(templateId, formData.headerMediaFile, formData.headerType);
      }

      toast.success('Template created successfully! You can now submit it for approval.');
      onSuccess?.(templateId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error creating template');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Upload media
  const uploadMedia = async (templateId: string, file: File, mediaType: string) => {
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append('media', file);
      formData.append('mediaType', mediaType);

      const response = await fetch(
        `/api/whatsapp/templates/${templateId}/upload-media`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload media');
      }

      toast.success('Media uploaded successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error uploading media');
      console.error(error);
    } finally {
      setUploadingMedia(false);
    }
  };

  const variables = extractVariables(formData.body);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Builder Form */}
      <div className="space-y-6">
        <Card title="Template Details" meta="Basic information about your template">
          <div className="space-y-4 p-4">
            <Field
              label="Template Name"
              required
              htmlFor="name"
              hint="Use lowercase letters, numbers, and underscores only"
            >
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., summer_sale_2024"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Category" required>
                <Select
                  value={formData.category}
                  onChange={(value) => setFormData({ ...formData, category: value })}
                  options={[
                    { value: 'MARKETING', label: 'Marketing' },
                    { value: 'UTILITY', label: 'Utility' },
                    { value: 'AUTHENTICATION', label: 'Authentication' },
                  ]}
                />
              </Field>

              <Field label="Language" required>
                <Select
                  value={formData.language}
                  onChange={(value) => setFormData({ ...formData, language: value })}
                  options={[
                    { value: 'en', label: 'English' },
                    { value: 'es', label: 'Spanish' },
                    { value: 'pt_BR', label: 'Portuguese' },
                    { value: 'fr', label: 'French' },
                    { value: 'de', label: 'German' },
                  ]}
                />
              </Field>
            </div>
          </div>
        </Card>

        {/* Header Section */}
        <Card title="Header (Optional)" meta="Add a header to your template">
          <div className="space-y-4 p-4">
            <div>
              <div className="mb-1.5 text-[12.5px] font-medium text-foreground">Header Type</div>
              <Tabs
                value={formData.headerType}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    headerType: value,
                    headerText: '',
                    headerMediaFile: null,
                  })
                }
              >
                <TabsList className="grid grid-cols-5">
                  <TabsTrigger value="NONE">None</TabsTrigger>
                  <TabsTrigger value="TEXT">Text</TabsTrigger>
                  <TabsTrigger value="IMAGE">Image</TabsTrigger>
                  <TabsTrigger value="VIDEO">Video</TabsTrigger>
                  <TabsTrigger value="DOCUMENT">Doc</TabsTrigger>
                </TabsList>

                <TabsContent value="TEXT" className="space-y-2">
                  <Input
                    value={formData.headerText}
                    onChange={(e) =>
                      setFormData({ ...formData, headerText: e.target.value })
                    }
                    placeholder="Header text (max 60 characters)"
                    maxLength={60}
                  />
                </TabsContent>

                <TabsContent value="IMAGE" className="space-y-2">
                  <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                    <ImageIcon className="size-8 mx-auto text-muted-foreground mb-2" />
                    <ShadcnInput
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(e) => {
                        setFormData({ ...formData, headerMediaType: 'IMAGE' });
                        handleMediaFileChange(e);
                      }}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      JPEG or PNG, max 5MB
                    </p>
                  </div>
                  {preview.headerMediaPreview && (
                    <NextImage
                      src={preview.headerMediaPreview}
                      alt="Preview"
                      width={0}
                      height={0}
                      sizes="100vw"
                      className="w-full h-auto rounded-lg"
                      unoptimized
                    />
                  )}
                </TabsContent>

                <TabsContent value="VIDEO" className="space-y-2">
                  <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                    <Video className="size-8 mx-auto text-muted-foreground mb-2" />
                    <ShadcnInput
                      type="file"
                      accept="video/mp4"
                      onChange={(e) => {
                        setFormData({ ...formData, headerMediaType: 'VIDEO' });
                        handleMediaFileChange(e);
                      }}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground mt-2">MP4, max 5MB</p>
                  </div>
                </TabsContent>

                <TabsContent value="DOCUMENT" className="space-y-2">
                  <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                    <FileText className="size-8 mx-auto text-muted-foreground mb-2" />
                    <ShadcnInput
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => {
                        setFormData({ ...formData, headerMediaType: 'DOCUMENT' });
                        handleMediaFileChange(e);
                      }}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground mt-2">PDF, max 5MB</p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </Card>

        {/* Body Section */}
        <Card title="Body *" meta="Main message content">
          <div className="space-y-4 p-4">
            <Textarea
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              placeholder="Enter your message... Use {{1}}, {{2}} for variables"
              rows={6}
              maxLength={1024}
            />
            <p className="text-xs text-muted-foreground">
              {formData.body.length}/1024 characters
            </p>
            {variables.length > 0 && (
              <div className="space-y-2">
                <div className="text-[12.5px] font-medium text-foreground">Variables Found:</div>
                <div className="flex flex-wrap gap-2">
                  {variables.map((v) => (
                    <Chip key={v} tone="purple">
                      {v}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Footer Section */}
        <Card title="Footer (Optional)" meta="Small text at the bottom">
          <div className="p-4">
            <Input
              value={formData.footer}
              onChange={(e) => setFormData({ ...formData, footer: e.target.value })}
              placeholder="e.g., Powered by MontrAI"
              maxLength={60}
            />
          </div>
        </Card>

        {/* Buttons Section */}
        <Card title="Buttons (Optional)" meta="Add up to 3 buttons">
          <div className="space-y-4 p-4">
            {formData.buttons.map((button, index) => (
              <div key={`${button.type}-${index}`} className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Chip tone="gray">{button.type}</Chip>
                  <IconButton
                    icon={X}
                    iconSize={16}
                    aria-label="Remove button"
                    onClick={() => removeButton(index)}
                  />
                </div>

                <Input
                  value={button.text}
                  onChange={(e) => updateButton(index, 'text', e.target.value)}
                  placeholder="Button text"
                  maxLength={20}
                />

                {button.type === 'URL' && (
                  <Input
                    value={button.url}
                    onChange={(e) => updateButton(index, 'url', e.target.value)}
                    placeholder="https://example.com"
                  />
                )}

                {button.type === 'PHONE_NUMBER' && (
                  <Input
                    value={button.phoneNumber}
                    onChange={(e) =>
                      updateButton(index, 'phoneNumber', e.target.value)
                    }
                    placeholder="+1234567890"
                  />
                )}
              </div>
            ))}

            {formData.buttons.length < 3 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={Plus}
                  onClick={() => addButton('QUICK_REPLY')}
                >
                  Quick Reply
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={LinkIcon}
                  onClick={() => addButton('URL')}
                >
                  URL
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Phone}
                  onClick={() => addButton('PHONE_NUMBER')}
                >
                  Phone
                </Button>
              </div>
            )}
          </div>
        </Card>

        <Button
          icon={Send}
          onClick={handleCreateTemplate}
          disabled={loading || uploadingMedia}
          className="w-full"
        >
          {loading ? 'Creating…' : uploadingMedia ? 'Uploading…' : 'Create Template'}
        </Button>
      </div>

      {/* Preview */}
      <TemplatePreview formData={formData} headerMediaPreview={preview.headerMediaPreview} />
    </div>
  );
}
