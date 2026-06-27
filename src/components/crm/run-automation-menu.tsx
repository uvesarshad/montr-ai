'use client';

/**
 * RunAutomationMenu — surfaces manual-trigger CRM automations as a "Run
 * automation" dropdown on CRM record lists (bulk) and detail pages (single).
 *
 * Lazily fetches the compatible automation list (on open) and POSTs the
 * selected workflow against the given recordIds. Composed from the ui-kit.
 */

import * as React from 'react';
import { Zap } from 'lucide-react';

import { Button } from '@/components/ui-kit';
import { ActionMenu, type ActionMenuItem } from '@/components/ui-kit/overlays';
import { useToast } from '@/hooks/use-toast';

export type RunAutomationEntityType = 'contact' | 'company' | 'deal';

interface AutomationOption {
  id: string;
  name: string;
  description?: string;
}

const ENTITY_LABEL: Record<RunAutomationEntityType, string> = {
  contact: 'contacts',
  company: 'companies',
  deal: 'deals',
};

export interface RunAutomationMenuProps {
  entityType: RunAutomationEntityType;
  recordIds: string[];
  availability: 'single' | 'bulk';
  /** Trigger Button variant (defaults to outline). */
  variant?: React.ComponentProps<typeof Button>['variant'];
  /** Trigger Button size (defaults to sm). */
  size?: React.ComponentProps<typeof Button>['size'];
}

export function RunAutomationMenu({
  entityType,
  recordIds,
  availability,
  variant = 'outline',
  size = 'sm',
}: RunAutomationMenuProps) {
  const { toast } = useToast();
  const [automations, setAutomations] = React.useState<AutomationOption[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  const loadAutomations = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v2/crm/automations?entityType=${entityType}&availability=${availability}`
      );
      if (!res.ok) throw new Error('Failed to load automations');
      const data = await res.json();
      // Route returns a bare array of { id, name, description }.
      const list: AutomationOption[] = Array.isArray(data) ? data : data.automations ?? [];
      setAutomations(list);
    } catch {
      setAutomations([]);
      toast({ variant: 'destructive', title: 'Could not load automations' });
    } finally {
      setLoading(false);
    }
  }, [entityType, availability, toast]);

  const run = React.useCallback(
    async (workflowId: string, name: string) => {
      if (running) return;
      setRunning(true);
      try {
        const res = await fetch('/api/v2/crm/automations/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId, entityType, recordIds }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.message || data?.error || 'Failed to run automation');
        }
        const enqueued = Number(data?.enqueued ?? 0);
        const skipped = Number(data?.skipped ?? 0);
        toast({
          title: `Queued ${enqueued} record${enqueued === 1 ? '' : 's'}`,
          description:
            skipped > 0
              ? `"${name}" started. ${skipped} record${skipped === 1 ? '' : 's'} skipped.`
              : `"${name}" started.`,
        });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Automation failed',
          description: err instanceof Error ? err.message : 'Unexpected error',
        });
      } finally {
        setRunning(false);
      }
    },
    [running, entityType, recordIds, toast]
  );

  const items = React.useMemo<ActionMenuItem[]>(() => {
    if (loading) {
      return [{ label: 'Loading…', disabled: true }];
    }
    if (!automations || automations.length === 0) {
      return [
        { label: `No automations for ${ENTITY_LABEL[entityType]}`, disabled: true },
        {
          label: "Add a 'Manual: CRM records' trigger in the automation builder",
          disabled: true,
        },
      ];
    }
    return automations.map<ActionMenuItem>((a) => ({
      label: a.name,
      icon: Zap,
      disabled: running,
      onSelect: () => run(a.id, a.name),
    }));
  }, [loading, automations, entityType, running, run]);

  const handleOpenChange = (open: boolean) => {
    if (open && automations === null && !loading) {
      void loadAutomations();
    }
  };

  return (
    <ActionMenu
      items={items}
      onOpenChange={handleOpenChange}
      trigger={
        <Button variant={variant} size={size} icon={Zap} disabled={recordIds.length === 0}>
          Run automation
        </Button>
      }
    />
  );
}
