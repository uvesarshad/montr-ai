'use client';

import { Company } from '@/types/crm';
import { ContactInfoCard, InfoRow } from '../contacts/contact-info-card';
import {
  Building2,
  MapPin,
  Globe,
  FileText,
  BarChart3,
} from 'lucide-react';

interface CompanyOverviewProps {
  company: Company;
}

export function CompanyOverview({ company }: CompanyOverviewProps) {
  const hasAddress =
    company.address &&
    (company.address.street ||
      company.address.city ||
      company.address.state ||
      company.address.country ||
      company.address.postalCode);

  const hasSocialProfiles =
    company.socialProfiles &&
    (company.socialProfiles.linkedin ||
      company.socialProfiles.twitter ||
      company.socialProfiles.facebook ||
      company.socialProfiles.instagram);

  const addressString = company.address
    ? [
        company.address.street,
        company.address.city,
        company.address.state,
        company.address.postalCode,
        company.address.country,
      ]
        .filter(Boolean)
        .join(', ')
    : undefined;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Basic Information */}
      <ContactInfoCard title="Basic Information" icon={<Building2 className="size-4" />}>
        <InfoRow label="Name" value={company.name} />
        <InfoRow label="Domain" value={company.domain} />
        <InfoRow label="Website" value={company.website} href={company.website} />
        <InfoRow label="Type" value={company.type} />
        <InfoRow label="Industry" value={company.industry} />
      </ContactInfoCard>

      {/* Business Details */}
      <ContactInfoCard title="Business Details" icon={<BarChart3 className="size-4" />}>
        <InfoRow label="Size" value={company.size} />
        <InfoRow label="Employees" value={company.employeeCount?.toLocaleString()} />
        <InfoRow
          label="Annual Revenue"
          value={company.annualRevenue ? `$${company.annualRevenue.toLocaleString()}` : undefined}
        />
      </ContactInfoCard>

      {/* Contact Information */}
      <ContactInfoCard title="Contact Information" icon={<Building2 className="size-4" />}>
        <InfoRow label="Email" value={company.email} href={`mailto:${company.email}`} />
        <InfoRow label="Phone" value={company.phone} href={`tel:${company.phone}`} />
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
          {company.socialProfiles?.linkedin && (
            <InfoRow
              label="LinkedIn"
              value="View Profile"
              href={company.socialProfiles.linkedin}
            />
          )}
          {company.socialProfiles?.twitter && (
            <InfoRow label="Twitter" value={company.socialProfiles.twitter} />
          )}
          {company.socialProfiles?.facebook && (
            <InfoRow
              label="Facebook"
              value="View Profile"
              href={company.socialProfiles.facebook}
            />
          )}
          {company.socialProfiles?.instagram && (
            <InfoRow label="Instagram" value={company.socialProfiles.instagram} />
          )}
        </ContactInfoCard>
      )}

      {/* Description */}
      {company.description && (
        <ContactInfoCard title="Description" icon={<FileText className="size-4" />}>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {company.description}
          </p>
        </ContactInfoCard>
      )}

      {/* Notes */}
      {company.notes?.plainText && (
        <ContactInfoCard title="Notes" icon={<FileText className="size-4" />}>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {company.notes.plainText}
          </p>
        </ContactInfoCard>
      )}

      {/* Custom Fields */}
      {company.customFields && Object.keys(company.customFields).length > 0 && (
        <ContactInfoCard title="Custom Fields" icon={<FileText className="size-4" />}>
          {Object.entries(company.customFields).map(([key, value]) => (
            <InfoRow key={key} label={key} value={String(value)} />
          ))}
        </ContactInfoCard>
      )}
    </div>
  );
}
