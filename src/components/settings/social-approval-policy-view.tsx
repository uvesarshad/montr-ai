'use client';

/**
 * Org-level social approval policy (audit C8 §A7).
 *
 * Org admins decide whether social posts require approval before they
 * schedule/publish, who it applies to, and which intents are gated. The
 * control is locked when the org's plan doesn't include the
 * `allowApprovalWorkflow` feature (links to /pricing to upgrade).
 *
 * Saves via PATCH /api/v2/organizations/social-approval-policy — the org id is
 * always resolved server-side from the session user.
 */

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, CalendarClock, Send } from 'lucide-react';

import {
  Button,
  Card,
  Chip,
  Banner,
  Segmented,
  SettingRow,
  Skeleton,
} from '@/components/ui-kit';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

type AppliesTo = 'all_members' | 'non_admins';
type RequireForIntent = 'schedule' | 'publish';

interface ApprovalPolicy {
  enabled: boolean;
  appliesTo: AppliesTo;
  requireFor: RequireForIntent[];
}

const DEFAULT_POLICY: ApprovalPolicy = {
  enabled: false,
  appliesTo: 'non_admins',
  requireFor: ['schedule', 'publish'],
};

const APPLIES_TO_OPTIONS = [
  { value: 'all_members', label: 'Everyone' },
  { value: 'non_admins', label: 'Members only — admins auto-approve' },
];

const REQUIRE_FOR_OPTIONS: { value: RequireForIntent; label: string; icon: typeof Send }[] = [
  { value: 'schedule', label: 'Schedule', icon: CalendarClock },
  { value: 'publish', label: 'Publish', icon: Send },
];

export function SocialApprovalPolicyView() {
  const { toast } = useToast();

  const [policy, setPolicy] = useState<ApprovalPolicy>(DEFAULT_POLICY);
  const [planAllows, setPlanAllows] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v2/organizations/social-approval-policy');
      if (!res.ok) throw new Error('Failed to load policy');
      const data = await res.json();
      setPolicy({ ...DEFAULT_POLICY, ...(data.policy || {}) });
      setPlanAllows(Boolean(data.planAllows));
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load approval policy.' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (next: ApprovalPolicy) => {
    setIsSaving(true);
    const previous = policy;
    setPolicy(next); // optimistic
    try {
      const res = await fetch('/api/v2/organizations/social-approval-policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPolicy(previous); // rollback
        if (res.status === 402) {
          setPlanAllows(false);
          toast({
            variant: 'destructive',
            title: 'Upgrade required',
            description: 'Your plan does not include approval workflows.',
          });
        } else {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: err.error || 'Failed to save approval policy.',
          });
        }
        return;
      }
      const data = await res.json();
      setPolicy({ ...DEFAULT_POLICY, ...(data.policy || next) });
      toast({ title: 'Approval policy saved' });
    } catch {
      setPolicy(previous);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save approval policy.' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleIntent = (intent: RequireForIntent) => {
    const has = policy.requireFor.includes(intent);
    const requireFor = has
      ? policy.requireFor.filter((i) => i !== intent)
      : [...policy.requireFor, intent];
    save({ ...policy, requireFor });
  };

  const controlsDisabled = !planAllows || isSaving;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <ShieldCheck className="size-4" /> Post approvals
        </h3>
        <p className="text-[12px] text-muted-foreground">
          Require social posts to be approved before they go out. This applies across all brands in
          your organization.
        </p>
      </div>

      {!planAllows && (
        <Banner tone="warn">
          Approval workflows aren&apos;t included in your current plan.{' '}
          <a href="/pricing" className="font-semibold underline underline-offset-2">
            Upgrade your plan
          </a>{' '}
          to require approvals before posts go out.
        </Banner>
      )}

      <Card icon={ShieldCheck} title="Approval policy" bodyClassName="px-4 pb-4 divide-y divide-border/60">
        <SettingRow
          label="Require approval"
          description="When on, social posts must be approved before they are scheduled or published."
        >
          <Switch
            id="approval-enabled"
            checked={policy.enabled}
            disabled={controlsDisabled}
            onCheckedChange={(checked) => save({ ...policy, enabled: checked })}
          />
        </SettingRow>

        <SettingRow
          label="Applies to"
          description="Choose whether everyone needs approval, or only members (admins auto-approve their own posts)."
        >
          <Segmented
            options={APPLIES_TO_OPTIONS}
            value={policy.appliesTo}
            onChange={(value) => {
              if (controlsDisabled || !policy.enabled) return;
              save({ ...policy, appliesTo: value as AppliesTo });
            }}
            className={!policy.enabled || controlsDisabled ? 'pointer-events-none opacity-50' : undefined}
          />
        </SettingRow>

        <SettingRow
          label="Require approval for"
          description="Pick which actions need approval before they run."
        >
          <div className="flex gap-1.5">
            {REQUIRE_FOR_OPTIONS.map(({ value, label, icon: Icon }) => {
              const selected = policy.requireFor.includes(value);
              const disabled = controlsDisabled || !policy.enabled;
              return (
                <Chip
                  key={value}
                  icon={Icon}
                  tone={selected ? 'brand' : 'gray'}
                  selected={selected}
                  onClick={disabled ? undefined : () => toggleIntent(value)}
                  className={disabled ? 'pointer-events-none opacity-50' : undefined}
                >
                  {label}
                </Chip>
              );
            })}
          </div>
        </SettingRow>
      </Card>

      {!planAllows && (
        <div className="flex justify-end">
          <Button variant="brand" size="sm" asChild>
            <a href="/pricing">Upgrade plan</a>
          </Button>
        </div>
      )}
    </div>
  );
}
