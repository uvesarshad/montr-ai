'use client';

import { Contact, ContactEmail, ContactPhone } from '@/types/crm';
import { ContactInfoCard, InfoRow } from './contact-info-card';
import { Chip } from '@/components/ui-kit';
import {
  User,
  Briefcase,
  MapPin,
  Globe,
  Shield,
  FileText,
} from 'lucide-react';

interface ContactOverviewProps {
  contact: Contact;
}

export function ContactOverview({ contact }: ContactOverviewProps) {
  const hasAddress =
    contact.address &&
    (contact.address.street ||
      contact.address.city ||
      contact.address.state ||
      contact.address.country ||
      contact.address.postalCode);

  const hasSocialProfiles =
    contact.socialProfiles &&
    (contact.socialProfiles.linkedin ||
      contact.socialProfiles.twitter ||
      contact.socialProfiles.facebook ||
      contact.socialProfiles.instagram);

  const addressString = contact.address
    ? [
        contact.address.street,
        contact.address.city,
        contact.address.state,
        contact.address.postalCode,
        contact.address.country,
      ]
        .filter(Boolean)
        .join(', ')
    : undefined;

  // Fall back to scalar fields when arrays are empty (legacy contacts).
  const emails: ContactEmail[] =
    contact.emails && contact.emails.length > 0
      ? contact.emails
      : contact.email
        ? [{ value: contact.email, label: 'work', primary: true }]
        : [];
  const phones: ContactPhone[] =
    contact.phones && contact.phones.length > 0
      ? contact.phones
      : contact.phone
        ? [{ value: contact.phone, label: 'mobile', primary: true }]
        : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Personal Information */}
      <ContactInfoCard title="Personal Information" icon={<User className="size-4" />}>
        <InfoRow label="First Name" value={contact.firstName} />
        <InfoRow label="Last Name" value={contact.lastName} />
        {emails.map((e, i) => (
          <InfoRow
            key={`email-${e.value}`}
            label={i === 0 ? 'Email' : ''}
            href={`mailto:${e.value}`}
            value={
              <span className="inline-flex items-center gap-2">
                {e.value}
                <Chip>{e.label}</Chip>
                {e.primary && <Chip tone="brand">Primary</Chip>}
              </span>
            }
          />
        ))}
        {phones.map((p, i) => (
          <InfoRow
            key={`phone-${p.value}`}
            label={i === 0 ? 'Phone' : ''}
            href={`tel:${p.value}`}
            value={
              <span className="inline-flex items-center gap-2">
                {p.value}
                <Chip>{p.label}</Chip>
                {p.primary && <Chip tone="brand">Primary</Chip>}
              </span>
            }
          />
        ))}
      </ContactInfoCard>

      {/* Professional Details */}
      <ContactInfoCard title="Professional Details" icon={<Briefcase className="size-4" />}>
        <InfoRow label="Job Title" value={contact.jobTitle} />
        <InfoRow label="Department" value={contact.department} />
        <InfoRow label="Status" value={contact.status} />
        <InfoRow label="Lifecycle" value={contact.lifecycle} />
        <InfoRow label="Rating" value={contact.rating} />
        <InfoRow label="Score" value={contact.score?.toString()} />
      </ContactInfoCard>

      {/* Address */}
      {hasAddress && (
        <ContactInfoCard title="Address" icon={<MapPin className="size-4" />}>
          <InfoRow label="Full Address" value={addressString} />
        </ContactInfoCard>
      )}

      {/* Social Profiles */}
      {hasSocialProfiles && (
        <ContactInfoCard title="Social Profiles" icon={<Globe className="size-4" />}>
          {contact.socialProfiles?.linkedin && (
            <InfoRow
              label="LinkedIn"
              value="View Profile"
              href={contact.socialProfiles.linkedin}
            />
          )}
          {contact.socialProfiles?.twitter && (
            <InfoRow label="Twitter" value={contact.socialProfiles.twitter} />
          )}
          {contact.socialProfiles?.facebook && (
            <InfoRow
              label="Facebook"
              value="View Profile"
              href={contact.socialProfiles.facebook}
            />
          )}
          {contact.socialProfiles?.instagram && (
            <InfoRow label="Instagram" value={contact.socialProfiles.instagram} />
          )}
        </ContactInfoCard>
      )}

      {/* Consent & Privacy */}
      <ContactInfoCard title="Consent & Privacy" icon={<Shield className="size-4" />}>
        <InfoRow
          label="Marketing Consent"
          value={contact.marketingConsent ? 'Yes' : 'No'}
        />
        {contact.consentTimestamp && (
          <InfoRow
            label="Consent Date"
            value={new Date(contact.consentTimestamp).toLocaleDateString()}
          />
        )}
        <InfoRow label="Do Not Contact" value={contact.doNotContact ? 'Yes' : 'No'} />
      </ContactInfoCard>

      {/* Notes */}
      {contact.notes?.plainText && (
        <ContactInfoCard title="Notes" icon={<FileText className="size-4" />}>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {contact.notes.plainText}
          </p>
        </ContactInfoCard>
      )}

      {/* Custom Fields */}
      {contact.customFields && Object.keys(contact.customFields).length > 0 && (
        <ContactInfoCard title="Custom Fields" icon={<FileText className="size-4" />}>
          {Object.entries(contact.customFields).map(([key, value]) => (
            <InfoRow key={key} label={key} value={String(value)} />
          ))}
        </ContactInfoCard>
      )}
    </div>
  );
}
