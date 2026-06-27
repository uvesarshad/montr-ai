'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronRight,
  LayoutDashboard,
  Mail,
  MessageSquare,
  PanelTop,
  Settings,
  Users,
  Workflow,
  FileText,
  Send,
  BarChart3,
  Inbox,
  LayoutTemplate,
} from 'lucide-react';
import { useAppHeader } from '@/components/app-header';
import { Button } from '@/components/ui-kit';
import { CreateCanvasButton } from '@/components/create-canvas-button';
import { cn } from '@/lib/utils';
import { isRouteActive } from '@/lib/navigation/route-match';

interface MarketingShellProps {
  children: React.ReactNode;
}

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/marketing', icon: LayoutDashboard },
    ],
  },
  {
    title: 'WhatsApp',
    items: [
      { label: 'Overview', href: '/marketing/whatsapp', icon: PanelTop },
      { label: 'Inbox', href: '/marketing/whatsapp/inbox', icon: Inbox },
      { label: 'Automation', href: '/marketing/whatsapp/automation', icon: Workflow },
      { label: 'Campaigns', href: '/marketing/whatsapp/campaigns', icon: Send },
      { label: 'Contacts', href: '/marketing/whatsapp/contacts', icon: Users },
      { label: 'Templates', href: '/marketing/whatsapp/templates', icon: FileText },
      { label: 'Analytics', href: '/marketing/whatsapp/analytics', icon: BarChart3 },
      { label: 'Settings', href: '/marketing/whatsapp/settings', icon: Settings },
    ],
  },
  {
    title: 'Email',
    items: [
      { label: 'Overview', href: '/marketing/email', icon: PanelTop },
      { label: 'Dashboard', href: '/marketing/email/dashboard', icon: LayoutDashboard },
      { label: 'Campaigns', href: '/marketing/email/campaigns', icon: Send },
      { label: 'Templates', href: '/marketing/email/templates', icon: FileText },
      { label: 'Providers', href: '/marketing/email/providers', icon: Settings },
    ],
  },
  {
    title: 'Automation',
    items: [
      { label: 'Canvas Workspace', href: '/canvas', icon: Workflow },
      { label: 'Templates', href: '/canvas/templates', icon: LayoutTemplate },
    ],
  },
];

const mobileDestinations: NavItem[] = [
  { label: 'Dashboard', href: '/marketing', icon: LayoutDashboard },
  { label: 'WhatsApp', href: '/marketing/whatsapp', icon: MessageSquare },
  { label: 'Email', href: '/marketing/email', icon: Mail },
  { label: 'Canvas', href: '/canvas', icon: Workflow },
];

export function MarketingShell({ children }: MarketingShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setHeaderInfo } = useAppHeader();

  const headerTitle = useMemo(() => getHeaderTitle(pathname), [pathname]);

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: headerTitle,
      actions: (
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="hidden h-8 lg:inline-flex">
            <Link href="/inbox?channel=whatsapp">
              <MessageSquare className="h-[15px] w-[15px]" />
              Inbox
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="hidden h-8 lg:inline-flex">
            <Link href="/campaigns?channel=email">
              <Mail className="h-[15px] w-[15px]" />
              Email
            </Link>
          </Button>
          <CreateCanvasButton size="sm" className="h-8 rounded-[0.4rem] px-3" iconClassName="size-4" />
        </div>
      ),
    });
  }, [headerTitle, setHeaderInfo]);

  return (
    <div className="app-glass overflow-hidden rounded-[14px]">
      <div className="grid min-h-[calc(100vh-5rem)] xl:grid-cols-[240px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="hidden border-r xl:flex xl:flex-col" style={{ borderColor: 'var(--app-border)' }}>
          {/* Sidebar header */}
          <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--app-border)' }}>
            <span className="flex size-7 flex-shrink-0 items-center justify-center rounded-[7px] bg-brand-muted text-brand-strong">
              <MessageSquare className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--app-text-faint)' }}>Marketing</p>
              <p className="truncate text-[12.5px] font-600 text-foreground font-semibold leading-tight">Cross-channel</p>
            </div>
          </div>

          {/* Nav sections */}
          <div className="flex-1 overflow-y-auto px-2 py-3">
            {sections.map((section) => (
              <div key={section.title} className="mb-4 last:mb-0">
                <p
                  className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--app-text-faint)' }}
                >
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isRouteActive(pathname, searchParams, item.href, {
                      exact:
                        item.href === '/marketing' ||
                        item.href === '/marketing/whatsapp' ||
                        item.href === '/marketing/email',
                    });
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'group flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[12.5px] transition-colors',
                          active
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5'
                        )}
                      >
                        <Icon className="size-3.5 flex-shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {active && <ChevronRight className="size-3 opacity-60" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Canvas handoff footer */}
          <div className="p-3" style={{ borderTop: '1px solid var(--app-border)' }}>
            <div className="rounded-[10px] border border-brand/15 bg-brand/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--app-text-faint)' }}>
                Canvas handoff
              </p>
              <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
                Build email and WhatsApp automations in the canvas workspace.
              </p>
              <Link
                href="/canvas"
                className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium"
                style={{ color: 'hsl(var(--primary))' }}
              >
                Open workspace
                <ChevronRight className="size-3" />
              </Link>
            </div>
          </div>
        </aside>

        {/* Content area */}
        <div className="min-w-0">
          {/* Mobile nav tabs */}
          <div className="px-3 py-2.5 xl:hidden" style={{ borderBottom: '1px solid var(--app-border)' }}>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {mobileDestinations.map((item) => {
                const active = isRouteActive(pathname, searchParams, item.href, {
                  exact:
                    item.href === '/marketing' ||
                    item.href === '/marketing/whatsapp' ||
                    item.href === '/marketing/email',
                });
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5'
                    )}
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}

function getHeaderTitle(pathname: string) {
  if (pathname === '/marketing') return 'Marketing';
  if (pathname === '/marketing/whatsapp') return 'WhatsApp';
  if (pathname.startsWith('/marketing/whatsapp/inbox')) return 'WhatsApp Inbox';
  if (pathname.startsWith('/marketing/whatsapp/automation')) return 'WhatsApp Automation';
  if (pathname.startsWith('/marketing/whatsapp/campaigns')) return 'WhatsApp Campaigns';
  if (pathname.startsWith('/marketing/whatsapp/contacts')) return 'Contacts';
  if (pathname.startsWith('/marketing/whatsapp/templates')) return 'WhatsApp Templates';
  if (pathname.startsWith('/marketing/whatsapp/analytics')) return 'WhatsApp Analytics';
  if (pathname.startsWith('/marketing/whatsapp/settings')) return 'WhatsApp Settings';
  if (pathname === '/marketing/email') return 'Email';
  if (pathname.startsWith('/marketing/email/dashboard')) return 'Email Dashboard';
  if (pathname.startsWith('/marketing/email/campaigns')) return 'Email Campaigns';
  if (pathname.startsWith('/marketing/email/templates')) return 'Email Templates';
  if (pathname.startsWith('/marketing/email/providers')) return 'Email Providers';

  return 'Marketing';
}



