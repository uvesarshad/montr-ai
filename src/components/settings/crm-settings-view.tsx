'use client';

import Link from 'next/link';
import { GitBranch, ShieldCheck, Webhook, ArrowRight, Info, Layers, Tag } from 'lucide-react';

import { Card, Banner } from '@/components/ui-kit';
import {
  CRM_SETTINGS_SECTIONS,
  shouldMergeCrmEmailAccountsWithConnections,
} from '@/lib/settings/crm-settings-sections';

const SECTION_ICONS = {
  pipelines: GitBranch,
  'custom-fields': Layers,
  tags: Tag,
  webhooks: Webhook,
  compliance: ShieldCheck,
};

export function CrmSettingsView() {
  const emailAccountDecision = shouldMergeCrmEmailAccountsWithConnections();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[13px] font-semibold">CRM Settings</h3>
        <p className="text-[12px] text-muted-foreground">
          Manage CRM-specific configuration without leaving the main settings area.
        </p>
      </div>

      <Banner tone="info" icon={Info} title="Email Connections Moved">
        {emailAccountDecision.reason}
      </Banner>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CRM_SETTINGS_SECTIONS.map((section) => {
          const Icon = SECTION_ICONS[section.key];

          return (
            <Link key={section.key} href={section.href} className="block">
              <Card
                lift
                bodyClassName="p-5 space-y-4"
                className="h-full hover:bg-accent/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-6 text-foreground" />
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{section.title}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{section.description}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Open {section.title.toLowerCase()} settings
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}



