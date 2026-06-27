'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createContactSchema,
  CreateContactInput,
  UpdateContactInput,
} from '@/validations/crm/contact.schema';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TagSelector } from '@/components/crm/shared/tag-selector';
import { OwnerSelector } from '@/components/crm/shared/owner-selector';
import { CompanySelector } from '@/components/crm/shared/company-selector';
import { RichTextEditor } from '@/components/crm/notes/rich-text-editor';
import { AvatarUpload } from '@/components/crm/shared/avatar-upload';
import { Loader2, Plus, X, Star } from 'lucide-react';
import { Contact } from '@/types/crm';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';

interface ContactFormProps {
  contact?: Contact;
  onSubmit: (data: CreateContactInput | UpdateContactInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export function ContactForm({ contact, onSubmit, onCancel, isSubmitting }: ContactFormProps) {
  const form = useForm<CreateContactInput>({
    resolver: zodResolver(createContactSchema),
    defaultValues: contact
      ? {
          firstName: contact.firstName,
          lastName: contact.lastName || '',
          email: contact.email || '',
          phone: contact.phone || '',
          emails: contact.emails && contact.emails.length > 0
            ? contact.emails
            : contact.email
              ? [{ value: contact.email, label: 'work' as const, primary: true }]
              : [],
          phones: contact.phones && contact.phones.length > 0
            ? contact.phones
            : contact.phone
              ? [{ value: contact.phone, label: 'mobile' as const, primary: true }]
              : [],
          avatar: contact.avatar || '',
          jobTitle: contact.jobTitle || '',
          department: contact.department || '',
          companyId: contact.companyId || '',
          status: contact.status,
          lifecycle: contact.lifecycle,
          rating: contact.rating,
          score: contact.score,
          tags: contact.tags,
          ownerId: contact.ownerId || '',
          address: contact.address || {},
          socialProfiles: contact.socialProfiles || {},
          marketingConsent: contact.marketingConsent,
          doNotContact: contact.doNotContact,
          notes: contact.notes || {},
        }
      : {
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          emails: [{ value: '', label: 'work', primary: true }],
          phones: [{ value: '', label: 'mobile', primary: true }],
          status: 'lead',
          lifecycle: 'lead',
          rating: 'warm',
          score: 0,
          tags: [],
          marketingConsent: false,
          doNotContact: false,
          notes: {},
        },
  });

  const emailsArray = useFieldArray({ control: form.control, name: 'emails' });
  const phonesArray = useFieldArray({ control: form.control, name: 'phones' });

  const setPrimaryEmail = (index: number) => {
    const current = form.getValues('emails') || [];
    form.setValue(
      'emails',
      current.map((e, i) => ({ ...e, primary: i === index })),
      { shouldDirty: true },
    );
  };
  const setPrimaryPhone = (index: number) => {
    const current = form.getValues('phones') || [];
    form.setValue(
      'phones',
      current.map((p, i) => ({ ...p, primary: i === index })),
      { shouldDirty: true },
    );
  };

  const handleSubmit = async (data: CreateContactInput) => {
    // Strip blank rows; ensure exactly one primary (repo also enforces this).
    const emails = (data.emails || []).filter((e) => e.value.trim());
    const phones = (data.phones || []).filter((p) => p.value.trim());
    if (emails.length && !emails.some((e) => e.primary)) emails[0].primary = true;
    if (phones.length && !phones.some((p) => p.primary)) phones[0].primary = true;
    await onSubmit({
      ...data,
      emails,
      phones,
      // Keep scalar mirrors in sync for any legacy consumer of the payload.
      email: emails.find((e) => e.primary)?.value ?? '',
      phone: phones.find((p) => p.primary)?.value ?? '',
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Avatar */}
        <FormField
          control={form.control}
          name="avatar"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profile Picture</FormLabel>
              <FormControl>
                <AvatarUpload
                  value={field.value}
                  onChange={field.onChange}
                  fallback={
                    form.watch('firstName')?.[0]?.toUpperCase() +
                      (form.watch('lastName')?.[0]?.toUpperCase() || '') || 'U'
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Basic Information</h3>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="John" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Emails (multi-value) */}
          <div className="space-y-2">
            <FormLabel>Emails</FormLabel>
            {emailsArray.fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <FormField
                  control={form.control}
                  name={`emails.${index}.value`}
                  render={({ field: f }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`emails.${index}.label`}
                  render={({ field: f }) => (
                    <Select onValueChange={f.onChange} value={f.value}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="work">Work</SelectItem>
                        <SelectItem value="personal">Personal</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <Button
                  type="button"
                  variant={form.watch(`emails.${index}.primary`) ? 'default' : 'outline'}
                  size="icon"
                  title="Set as primary"
                  onClick={() => setPrimaryEmail(index)}
                >
                  <Star className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Remove email"
                  onClick={() => emailsArray.remove(index)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                emailsArray.append({
                  value: '',
                  label: 'work',
                  primary: emailsArray.fields.length === 0,
                })
              }
            >
              <Plus className="mr-2 size-4" /> Add email
            </Button>
          </div>

          {/* Phones (multi-value) */}
          <div className="space-y-2">
            <FormLabel>Phones</FormLabel>
            {phonesArray.fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <FormField
                  control={form.control}
                  name={`phones.${index}.value`}
                  render={({ field: f }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input type="tel" placeholder="+1 (555) 123-4567" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`phones.${index}.label`}
                  render={({ field: f }) => (
                    <Select onValueChange={f.onChange} value={f.value}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="work">Work</SelectItem>
                        <SelectItem value="mobile">Mobile</SelectItem>
                        <SelectItem value="home">Home</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <Button
                  type="button"
                  variant={form.watch(`phones.${index}.primary`) ? 'default' : 'outline'}
                  size="icon"
                  title="Set as primary"
                  onClick={() => setPrimaryPhone(index)}
                >
                  <Star className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Remove phone"
                  onClick={() => phonesArray.remove(index)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                phonesArray.append({
                  value: '',
                  label: 'mobile',
                  primary: phonesArray.fields.length === 0,
                })
              }
            >
              <Plus className="mr-2 size-4" /> Add phone
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="jobTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Software Engineer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <FormControl>
                    <Input placeholder="Engineering" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="companyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company</FormLabel>
                <FormControl>
                  <CompanySelector value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Status & Lifecycle */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Status & Lifecycle</h3>

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="churned">Churned</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lifecycle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lifecycle Stage</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select lifecycle" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="subscriber">Subscriber</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="mql">MQL</SelectItem>
                      <SelectItem value="sql">SQL</SelectItem>
                      <SelectItem value="opportunity">Opportunity</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="evangelist">Evangelist</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rating</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select rating" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="hot">Hot</SelectItem>
                      <SelectItem value="warm">Warm</SelectItem>
                      <SelectItem value="cold">Cold</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Address */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Address</h3>

          <FormField
            control={form.control}
            name="address.street"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street</FormLabel>
                <FormControl>
                  <Input placeholder="123 Main St" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="address.city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="New York" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address.state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Input placeholder="NY" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="address.postalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Postal Code</FormLabel>
                  <FormControl>
                    <Input placeholder="10001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address.country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <FormControl>
                    <Input placeholder="United States" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Social Profiles */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Social Profiles</h3>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="socialProfiles.linkedin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>LinkedIn</FormLabel>
                  <FormControl>
                    <Input placeholder="https://linkedin.com/in/..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="socialProfiles.twitter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Twitter</FormLabel>
                  <FormControl>
                    <Input placeholder="@username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Tags & Assignment */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Tags & Assignment</h3>

          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <FormControl>
                  <TagSelector
                    value={field.value || []}
                    onChange={field.onChange}
                    entityType="contact"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ownerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Owner</FormLabel>
                <FormControl>
                  <OwnerSelector value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Consent & Privacy */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Consent & Privacy</h3>

          <FormField
            control={form.control}
            name="marketingConsent"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Marketing Consent</FormLabel>
                  <FormDescription>
                    Contact has given consent to receive marketing communications
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="doNotContact"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-x-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Do Not Contact</FormLabel>
                  <FormDescription>Contact has opted out of all communications</FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Notes */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Notes</h3>

          <FormField
            control={form.control}
            name="notes.content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Internal Notes</FormLabel>
                <FormControl>
                  <RichTextEditor
                    value={field.value}
                    onChange={(json, text) => {
                      field.onChange(json);
                      form.setValue('notes.plainText', text);
                    }}
                    placeholder="Add internal notes about this contact..."
                    minHeight="200px"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-2 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {contact ? 'Update Contact' : 'Create Contact'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
