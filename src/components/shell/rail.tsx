'use client';

/**
 * Rail — the primary module switcher.
 *
 * 60px icon strip that hover-expands to a 248px floating OVERLAY (content never
 * reflows — the layout reserves a constant 60px and the panel escapes over the
 * content). Near-black active tile, app's outcome-based IA groups, and the user
 * account fused at the bottom. Pure-CSS hover expansion (`group/rail`), so it
 * needs no collapse state from the sidebar provider.
 *
 * Sections live in the per-module SubNav (ModuleSubRail), not here.
 */

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useSession, signOut } from '@/lib/auth-client';
import {
  LayoutGrid,
  BarChart3,
  BrainCircuit,
  MessageSquare,
  Workflow,
  Users,
  Inbox,
  Mail,
  Megaphone,
  MessageCircle,
  CalendarDays,
  Bot,
  BookText,
  FileText,
  Shield,
  Settings as SettingsIcon,
  LogOut,
  Check,
  ChevronsUpDown,
  LifeBuoy,
  Sparkles,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { isRouteActive } from '@/lib/navigation/route-match';
import { getUserAvatar } from '@/lib/avatar-utils';
import { useProfile } from '@/hooks/use-profile';
import { Avatar } from '@/components/ui-kit';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type RailItem = { href: string; icon: LucideIcon; label: string; live?: boolean };
type RailGroup = { label: string; items: RailItem[] };

// Outcome-based IA groups (the shell_and_ia lock). Switcher only — each module's
// deeper sections live in its own ModuleSubRail.
const RAIL_GROUPS: RailGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutGrid, label: 'Dashboard' },
      { href: '/analytics', icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    label: 'AI & Automation',
    items: [
      { href: '/agent', icon: BrainCircuit, label: 'Agent', live: true },
      { href: '/ai-studio', icon: MessageSquare, label: 'AI Studio' },
      { href: '/canvas', icon: Workflow, label: 'Automation' },
    ],
  },
  { label: 'Customers', items: [{ href: '/crm', icon: Users, label: 'CRM' }] },
  {
    label: 'Engagement',
    items: [
      { href: '/inbox', icon: Inbox, label: 'Inbox' },
      { href: '/campaigns', icon: Mail, label: 'Email' },
      { href: '/whatsapp', icon: MessageCircle, label: 'WhatsApp' },
      { href: '/social', icon: CalendarDays, label: 'Social' },
      { href: '/ads', icon: Megaphone, label: 'Ads' },
      { href: '/ai-bots', icon: Bot, label: 'AI Bots' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/docs', icon: BookText, label: 'Docs' },
      { href: '/forms', icon: FileText, label: 'Forms' },
    ],
  },
];

export function Rail() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { data: profile } = useProfile();

  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const avatarUrl = session?.user?.id
    ? getUserAvatar(session.user.id, session.user.image)
    : undefined;

  // Workspace card data (mockup AccountMenu) — single-org workspace.
  const workspaceName =
    profile?.organizationName || profile?.company || session?.user?.name || 'Workspace';
  const planLabel = profile?.planId ? 'Paid plan' : 'Free plan';

  const groups: RailGroup[] = isAdmin
    ? [...RAIL_GROUPS, { label: 'System', items: [{ href: '/admin', icon: Shield, label: 'Admin' }] }]
    : RAIL_GROUPS;

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <div className="fixed inset-y-0 left-0 z-40 hidden w-[60px] sm:block">
      <aside className="group/rail absolute inset-y-0 left-0 flex w-[60px] flex-col overflow-hidden border-r border-white/10 bg-[#0a0a0a] transition-[width] duration-200 ease-out hover:w-[248px] hover:shadow-2xl">
        {/* Brand */}
        <Link href="/dashboard" className="flex h-[54px] shrink-0 items-center" aria-label="Montr AI home">
          <span className="grid w-[60px] shrink-0 place-items-center">
            <span className="flex h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-lg bg-accent-gradient">
              <Image
                src="/montr_ai_logo_icon.png"
                alt="Montr AI"
                width={30}
                height={30}
                className="h-[30px] w-[30px]"
              />
            </span>
          </span>
          <span className="whitespace-nowrap text-[15px] font-bold tracking-tight text-white opacity-0 transition-opacity group-hover/rail:opacity-100">
            Montr AI
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1.5 [&::-webkit-scrollbar]:w-0">
          {groups.map((group, gi) => (
            <div key={group.label}>
              <div className="mt-2 flex h-[22px] items-center whitespace-nowrap pl-[60px] text-[10.5px] font-semibold uppercase tracking-wider text-white/45 opacity-0 transition-opacity group-hover/rail:opacity-100">
                {group.label}
              </div>
              {/* Collapsed-state group separator (mockup .rail-sep) — cross-fades with the label on hover */}
              {gi > 0 ? (
                <div className="mx-auto my-1.5 h-px w-6 bg-white/10 transition-opacity group-hover/rail:opacity-0" />
              ) : null}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(pathname, searchParams, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    target={item.href.startsWith('/admin') ? '_blank' : undefined}
                    rel={item.href.startsWith('/admin') ? 'noopener noreferrer' : undefined}
                    className="flex h-11 w-full items-center whitespace-nowrap text-white/55 transition-colors hover:text-white"
                  >
                    <span className="grid w-[60px] shrink-0 place-items-center">
                      <span
                        className={cn(
                          'grid h-[38px] w-[38px] place-items-center rounded-[11px] transition-colors',
                          active
                            ? 'bg-brand text-brand-foreground shadow-lg shadow-brand/30'
                            : 'hover:bg-white/10',
                        )}
                      >
                        <Icon className="h-[19px] w-[19px]" />
                      </span>
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[13.5px] font-medium opacity-0 transition-opacity group-hover/rail:opacity-100',
                        active && 'text-white',
                      )}
                    >
                      {item.label}
                    </span>
                    {item.live ? (
                      <span className="mr-3 inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-500 opacity-0 transition-opacity group-hover/rail:opacity-100">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Live
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Account */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account"
              className="flex h-[54px] w-full shrink-0 items-center border-t border-white/10 text-left transition-colors hover:bg-white/5"
            >
              <span className="grid w-[60px] shrink-0 place-items-center">
                <Avatar name={session?.user?.name || session?.user?.email || 'User'} src={avatarUrl} size={28} />
              </span>
              <span className="flex min-w-0 flex-col opacity-0 transition-opacity group-hover/rail:opacity-100">
                <span className="truncate text-[13px] font-semibold leading-tight text-white">
                  {workspaceName}
                </span>
                <span className="truncate text-[11.5px] leading-tight text-white/55">
                  {session?.user?.name || 'Workspace user'}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto mr-3 size-4 shrink-0 text-white/55 opacity-0 transition-opacity group-hover/rail:opacity-100" />
            </button>
          </DropdownMenuTrigger>
          {/* Mockup AccountMenu — workspace card · menu rows · sign out */}
          <DropdownMenuContent
            align="start"
            side="top"
            sideOffset={8}
            className="w-[268px] rounded-xl p-0 shadow-[var(--app-shadow-strong)]"
          >
            <div className="px-3 pb-2 pt-2.5">
              <DropdownMenuLabel className="px-1.5 pb-1.5 pt-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                Workspace
              </DropdownMenuLabel>
              <div className="flex items-center gap-2.5 rounded-md bg-muted px-2 py-[7px]">
                <Avatar name={workspaceName} size={26} square />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-semibold leading-tight text-foreground">
                    {workspaceName}
                  </span>
                  <span className="truncate text-[11px] leading-tight text-muted-foreground">
                    {planLabel}
                  </span>
                </span>
                <Check className="h-[15px] w-[15px] shrink-0 text-brand-strong" />
              </div>
            </div>
            <DropdownMenuSeparator className="my-0" />
            <div className="p-1.5">
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer text-[13px]">
                  <UserRound className="mr-2.5 size-4 text-muted-foreground" /> Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer text-[13px]">
                  <SettingsIcon className="mr-2.5 size-4 text-muted-foreground" /> Workspace settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings?tab=billing" className="cursor-pointer text-[13px]">
                  <Zap className="mr-2.5 size-4 text-muted-foreground" /> Billing &amp; credits
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push('/dashboard?onboarding=replay')}
                className="cursor-pointer text-[13px]"
              >
                <Sparkles className="mr-2.5 size-4 text-muted-foreground" /> Replay onboarding
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings?tab=support" className="cursor-pointer text-[13px]">
                  <LifeBuoy className="mr-2.5 size-4 text-muted-foreground" /> Help &amp; support
                </Link>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem asChild>
                  <Link
                    href="/admin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer text-[13px]"
                  >
                    <Shield className="mr-2.5 size-4 text-muted-foreground" /> Admin console
                  </Link>
                </DropdownMenuItem>
              ) : null}
            </div>
            <DropdownMenuSeparator className="my-0" />
            <div className="p-1.5">
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-[13px]">
                <LogOut className="mr-2.5 size-4 text-muted-foreground" /> Sign out
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </aside>
    </div>
  );
}
