'use client';

import Image from 'next/image';
import { BarChart3, Mail } from 'lucide-react';

import type { WhiteLabelBranding } from '@/lib/db/models/white-label-profile.model';

/**
 * Report header for the social analytics/reporting surface (Epic 9).
 *
 * When the org has approved, live white-label branding it renders the agency's
 * logo/name/colors; otherwise it falls back to the default MontrAI header.
 * REPORTING ONLY — never used in the composer/publishing path.
 */
export function ReportBrandingHeader({ branding }: { branding: WhiteLabelBranding | null }) {
    if (!branding) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4">
                <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]">
                        <BarChart3 className="h-5 w-5" />
                    </span>
                    <div>
                        <p className="text-sm font-semibold tracking-[-0.015em]">MontrAI</p>
                        <p className="text-xs text-muted-foreground">Social performance report</p>
                    </div>
                </div>
            </div>
        );
    }

    const primary = branding.primaryColor || 'var(--brand)';
    const accent = branding.accentColor || primary;

    return (
        <div
            className="flex items-center justify-between gap-3 rounded-2xl border px-5 py-4"
            style={{ borderColor: `${accent}33` }}
        >
            <div className="flex items-center gap-3">
                {branding.logoUrl ? (
                    <Image
                        src={branding.logoUrl}
                        alt={branding.companyName}
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-lg object-contain"
                        unoptimized
                    />
                ) : (
                    <span
                        className="grid h-9 w-9 place-items-center rounded-lg text-sm font-semibold text-white"
                        style={{ backgroundColor: primary }}
                    >
                        {branding.companyName.charAt(0).toUpperCase()}
                    </span>
                )}
                <div>
                    <p className="text-sm font-semibold tracking-[-0.015em]" style={{ color: primary }}>
                        {branding.companyName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {branding.footerText || 'Social performance report'}
                    </p>
                </div>
            </div>

            {branding.supportEmail ? (
                <a
                    href={`mailto:${branding.supportEmail}`}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                    <Mail className="h-3.5 w-3.5" />
                    {branding.supportEmail}
                </a>
            ) : null}
        </div>
    );
}
