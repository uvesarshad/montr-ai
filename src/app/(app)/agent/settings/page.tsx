'use client';

import { useCallback, useEffect, useState } from 'react';
import { Settings, Bot, Shield, DollarSign, Wrench, Save, RefreshCw, RotateCcw, Zap, Trash2, Plus, Phone, MessageCircle } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  PageHeader,
  Card,
  Chip,
  Banner,
  Button,
  IconButton,
  Input,
  Field,
  Textarea,
  Select,
  SettingRow,
  Skeleton,
  ConfirmDialog,
} from '@/components/ui-kit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Brand {
  _id: string;
  name: string;
}

interface VoiceCallPolicy {
  mode: 'always_ask' | 'always_autonomous' | 'conditional';
  conditions?: {
    autonomousPurposes?: string[];
    knownContactsOnly?: boolean;
    businessHoursOnly?: boolean;
  };
}

interface BrandContext {
  agentName: string;
  personality: string;
  tone: string;
  languageStyle: string;
  customInstructions: string;
  enabledTools: string[];
  requireApproval: string[];
  maxBudgetPerSession: number;
  voiceCallPolicy?: VoiceCallPolicy;
}

interface AgentPlanLimits {
  allowAgent: boolean;
  allowedModels: string[];
  defaultModel: string;
  routerModel: string;
  maxTokensUsdCents: number;
  maxToolCalls: number;
  maxWallClockHours: number;
  allowedAutonomyModes: string[];
  defaultAutonomyMode: string;
}

interface RecurringConfig {
  _id: string;
  templateId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  budgetCap: number;
  enabled: boolean;
  runCount: number;
  lastRunAt?: string;
}

interface MissionTriggerConfig {
  _id: string;
  templateId: string;
  name: string;
  eventType: string;
  enabled: boolean;
  triggerCount: number;
  lastTriggeredAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  watch:      'Watch — read-only, no external actions',
  supervised: 'Supervised — HITL approval for risky actions',
  autopilot:  'Autopilot — fully autonomous',
};

// ─── Presentational subsections ───────────────────────────────────────────────

function RecurringMissionsCard({
  configs,
  onToggle,
  onDelete,
}: {
  configs: RecurringConfig[];
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (cfg: RecurringConfig) => void;
}) {
  return (
    <Card
      icon={RotateCcw}
      title="Recurring Missions"
      action={
        <Button size="sm" variant="outline" icon={Plus} asChild>
          <a href="/agent/recurring-missions/new">Add</a>
        </Button>
      }
    >
      <div className="px-4 pb-4">
        {configs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recurring missions configured for this brand.</p>
        ) : (
          <div className="space-y-2">
            {configs.map(cfg => (
              <div key={cfg._id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{cfg.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{cfg.cronExpression} · {cfg.runCount} runs</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch checked={cfg.enabled} onCheckedChange={v => onToggle(cfg._id, v)} />
                  <IconButton icon={Trash2} iconSize={14} aria-label="Delete" className="hover:text-danger" onClick={() => onDelete(cfg)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function EventTriggersCard({
  configs,
  onToggle,
  onDelete,
}: {
  configs: MissionTriggerConfig[];
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (t: MissionTriggerConfig) => void;
}) {
  return (
    <Card
      icon={Zap}
      title="Event Triggers"
      action={
        <Button size="sm" variant="outline" icon={Plus} asChild>
          <a href="/agent/mission-triggers/new">Add</a>
        </Button>
      }
    >
      <div className="px-4 pb-4">
        {configs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No event triggers configured for this brand.</p>
        ) : (
          <div className="space-y-2">
            {configs.map(t => (
              <div key={t._id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Chip tone="gray">{t.eventType}</Chip>
                    {t.triggerCount} fires
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch checked={t.enabled} onCheckedChange={v => onToggle(t._id, v)} />
                  <IconButton icon={Trash2} iconSize={14} aria-label="Delete" className="hover:text-danger" onClick={() => onDelete(t)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentSettingsPage() {
  const { brands: contextBrands, currentBrandId, setCurrentBrandId } = useCurrentBrand();
  const [selectedBrandId, setSelectedBrandIdLocal] = useState<string>('');
  const [context, setContext] = useState<BrandContext | null>(null);
  const [planLimits, setPlanLimits] = useState<AgentPlanLimits | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // form state (local, only persisted on save)
  const [form, setForm] = useState<BrandContext>({
    agentName: '',
    personality: '',
    tone: 'Professional',
    languageStyle: 'Clear and concise',
    customInstructions: '',
    enabledTools: [],
    requireApproval: [],
    maxBudgetPerSession: 100,
    voiceCallPolicy: { mode: 'always_ask' },
  });

  // Sync with global brand context: initialize from currentBrandId, fall back to first brand.
  const brands: Brand[] = contextBrands.map(b => ({ _id: b.id, name: b.name }));

  useEffect(() => {
    if (selectedBrandId) return;
    const initial = currentBrandId || brands[0]?._id || '';
    if (initial) setSelectedBrandIdLocal(initial);
  }, [currentBrandId, brands, selectedBrandId]);

  const setSelectedBrandId = (id: string) => {
    setSelectedBrandIdLocal(id);
    setCurrentBrandId(id);
  };

  // ── Load brand context + plan limits ─────────────────────────────────────────

  const loadBrandData = useCallback(async (brandId: string) => {
    if (!brandId) return;
    setLoading(true);
    try {
      const [ctxRes, planRes] = await Promise.all([
        fetch(`/api/v2/brands/${brandId}/context`),
        fetch('/api/v2/agent/plan-gate'),
      ]);
      const ctxData: BrandContext = await ctxRes.json();
      setContext(ctxData);
      setForm({
        agentName: ctxData.agentName ?? '',
        personality: ctxData.personality ?? '',
        tone: ctxData.tone ?? 'Professional',
        languageStyle: ctxData.languageStyle ?? 'Clear and concise',
        customInstructions: ctxData.customInstructions ?? '',
        enabledTools: ctxData.enabledTools ?? [],
        requireApproval: ctxData.requireApproval ?? [],
        maxBudgetPerSession: ctxData.maxBudgetPerSession ?? 100,
        voiceCallPolicy: ctxData.voiceCallPolicy ?? { mode: 'always_ask' },
      });
      if (planRes.ok) {
        const planData = await planRes.json();
        setPlanLimits(planData);
      }
    } catch {
      toast.error('Failed to load agent settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBrandId) loadBrandData(selectedBrandId);
  }, [selectedBrandId, loadBrandData]);

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedBrandId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/brands/${selectedBrandId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success('Agent settings saved');
        setContext(form);
      } else {
        toast.error('Failed to save settings');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof BrandContext>(key: K, value: BrandContext[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const isDirty = JSON.stringify(form) !== JSON.stringify(context);

  // ── Recurring missions ───────────────────────────────────────────────────────

  const [recurringConfigs, setRecurringConfigs] = useState<RecurringConfig[]>([]);
  const [recurringToDelete, setRecurringToDelete] = useState<RecurringConfig | null>(null);

  const loadRecurring = useCallback(async (brandId: string) => {
    if (!brandId) return;
    try {
      const res = await fetch(`/api/v2/agent/recurring-missions?brandId=${brandId}`);
      if (res.ok) {
        const data = await res.json();
        setRecurringConfigs(data.configs ?? []);
      }
    } catch {/* silent */}
  }, []);

  useEffect(() => { if (selectedBrandId) loadRecurring(selectedBrandId); }, [selectedBrandId, loadRecurring]);

  const handleDeleteRecurring = async (id: string) => {
    await fetch(`/api/v2/agent/recurring-missions/${id}`, { method: 'DELETE' });
    setRecurringConfigs(prev => prev.filter(c => c._id !== id));
    toast.success('Recurring mission deleted');
  };

  const handleToggleRecurring = async (id: string, enabled: boolean) => {
    await fetch(`/api/v2/agent/recurring-missions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    setRecurringConfigs(prev => prev.map(c => c._id === id ? { ...c, enabled } : c));
  };

  // ── Event triggers ───────────────────────────────────────────────────────────

  const [triggerConfigs, setTriggerConfigs] = useState<MissionTriggerConfig[]>([]);
  const [triggerToDelete, setTriggerToDelete] = useState<MissionTriggerConfig | null>(null);

  const loadTriggers = useCallback(async (brandId: string) => {
    if (!brandId) return;
    try {
      const res = await fetch(`/api/v2/agent/mission-triggers?brandId=${brandId}`);
      if (res.ok) {
        const data = await res.json();
        setTriggerConfigs(data.triggers ?? []);
      }
    } catch {/* silent */}
  }, []);

  useEffect(() => { if (selectedBrandId) loadTriggers(selectedBrandId); }, [selectedBrandId, loadTriggers]);

  const handleDeleteTrigger = async (id: string) => {
    await fetch(`/api/v2/agent/mission-triggers/${id}`, { method: 'DELETE' });
    setTriggerConfigs(prev => prev.filter(t => t._id !== id));
    toast.success('Trigger deleted');
  };

  const handleToggleTrigger = async (id: string, enabled: boolean) => {
    await fetch(`/api/v2/agent/mission-triggers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    setTriggerConfigs(prev => prev.map(t => t._id === id ? { ...t, enabled } : t));
  };

  // ── WhatsApp control channel (G12 2026-06-05) ───────────────────────────────

  interface ControlBinding {
    status: 'pending' | 'active' | 'revoked';
    phone: string;
    pairedAt?: string | null;
    pairingExpiresAt?: string | null;
  }

  const [controlBinding, setControlBinding] = useState<ControlBinding | null>(null);
  const [controlPhone, setControlPhone] = useState('');
  const [pairingInfo, setPairingInfo] = useState<{ code: string; whatsappNumber: string; expiresAt: string } | null>(null);
  const [controlBusy, setControlBusy] = useState(false);

  const loadControlBinding = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/agent/control-channel');
      if (res.ok) {
        const data = await res.json();
        setControlBinding(data.binding ?? null);
      }
    } catch {/* silent */}
  }, []);

  useEffect(() => { loadControlBinding(); }, [loadControlBinding]);

  const handleStartPairing = async () => {
    if (!controlPhone.trim()) return;
    setControlBusy(true);
    try {
      const res = await fetch('/api/v2/agent/control-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: controlPhone, brandId: selectedBrandId || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setPairingInfo(data);
        await loadControlBinding();
      } else {
        toast.error(data.error || 'Failed to start pairing');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setControlBusy(false);
    }
  };

  const handleRevokeControl = async () => {
    setControlBusy(true);
    try {
      await fetch('/api/v2/agent/control-channel', { method: 'DELETE' });
      setControlBinding(null);
      setPairingInfo(null);
      toast.success('WhatsApp control disconnected');
    } catch {
      toast.error('Network error');
    } finally {
      setControlBusy(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader icon={Settings} title="Agent Settings" />

      {/* Brand selector */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[12.5px] font-medium">Brand</span>
        <Select
          value={selectedBrandId}
          onChange={setSelectedBrandId}
          placeholder="Select a brand"
          triggerClassName="w-64"
          options={brands.map(b => ({ value: b._id, label: b.name }))}
        />
        {selectedBrandId && (
          <IconButton icon={RefreshCw} iconSize={16} aria-label="Reload" onClick={() => loadBrandData(selectedBrandId)} />
        )}
      </div>

      {/* Plan limits banner */}
      {planLimits && (
        planLimits.allowAgent ? (
          <Banner tone="ok" icon={Shield} title="Agent enabled on your plan">
            Modes: {planLimits.allowedAutonomyModes.join(', ')} ·
            Budget: {planLimits.maxTokensUsdCents === -1 ? 'Unlimited' : `$${(planLimits.maxTokensUsdCents / 100).toFixed(2)}`} /mission ·
            Tool calls: {planLimits.maxToolCalls} ·
            Default model: {planLimits.defaultModel}
          </Banner>
        ) : (
          <Banner tone="warn" icon={Shield} title="Agent not enabled on your plan">
            Upgrade your plan to use AI agents.
          </Banner>
        )
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !selectedBrandId ? (
        <p className="text-sm text-muted-foreground">Select a brand to configure its agent settings.</p>
      ) : (
        <div className="space-y-5">
          {/* Identity */}
          <Card icon={Bot} title="Agent Identity">
            <div className="space-y-4 px-4 pb-4">
              <Field label="Agent Name" htmlFor="agentName">
                <Input
                  id="agentName"
                  value={form.agentName}
                  onChange={e => set('agentName', e.target.value)}
                  placeholder="MontrAI Agent"
                  wrapClassName="max-w-xs"
                />
              </Field>
              <Field label="Tone" htmlFor="tone">
                <Input
                  id="tone"
                  value={form.tone}
                  onChange={e => set('tone', e.target.value)}
                  placeholder="Professional"
                  wrapClassName="max-w-xs"
                />
              </Field>
              <Field label="Personality" htmlFor="personality">
                <Textarea
                  id="personality"
                  value={form.personality}
                  onChange={e => set('personality', e.target.value)}
                  placeholder="You are a professional, proactive, and friendly marketing assistant."
                  rows={3}
                />
              </Field>
              <Field
                label="Custom Instructions"
                hint="Appended to every system prompt."
                htmlFor="customInstructions"
              >
                <Textarea
                  id="customInstructions"
                  value={form.customInstructions}
                  onChange={e => set('customInstructions', e.target.value)}
                  placeholder="Always respond in English. Never mention competitors by name."
                  rows={4}
                />
              </Field>
            </div>
          </Card>

          {/* Budget */}
          <Card icon={DollarSign} title="Budget">
            <div className="px-4 pb-4">
              <SettingRow
                label="Max Budget per Session (credits)"
                description="Caps spending per conversation. Plan limit overrides if lower."
              >
                <Input
                  id="maxBudget"
                  type="number"
                  min="1"
                  className="text-right"
                  wrapClassName="w-24"
                  value={form.maxBudgetPerSession}
                  onChange={e => set('maxBudgetPerSession', parseInt(e.target.value) || 100)}
                />
              </SettingRow>
            </div>
          </Card>

          {/* Tool whitelist */}
          <Card icon={Wrench} title="Tool Permissions">
            <div className="space-y-4 px-4 pb-4">
              <Field
                label="Enabled Tools"
                htmlFor="enabledTools"
                hint={<>Comma-separated; empty = all tools. Visit <a href="/agent/tools" className="underline">Agent Tool Catalog</a> for tool names.</>}
              >
                <Textarea
                  id="enabledTools"
                  value={form.enabledTools.join(', ')}
                  onChange={e => set('enabledTools', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="createContact, searchKnowledgeBase, schedulePost"
                  rows={3}
                  className="font-mono text-xs"
                />
              </Field>
              <div className="h-px bg-border" />
              <Field
                label="Require Approval For"
                htmlFor="requireApproval"
                hint="Tools added here always need sign-off."
              >
                <Textarea
                  id="requireApproval"
                  value={form.requireApproval.join(', ')}
                  onChange={e => set('requireApproval', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="sendWhatsApp, triggerWorkflow"
                  rows={2}
                  className="font-mono text-xs"
                />
              </Field>
            </div>
          </Card>

          {/* Voice call policy (D4 2026-06-05) */}
          <Card icon={Phone} title="Voice Call Policy">
            <div className="space-y-4 px-4 pb-4">
              <Field
                label="When the agent wants to place a call"
                htmlFor="voicePolicyMode"
                hint="Governs outbound calls (initiate_call, schedule_call, bulk_call) on this brand."
              >
                <Select
                  value={form.voiceCallPolicy?.mode ?? 'always_ask'}
                  onChange={(mode) => set('voiceCallPolicy', {
                    ...(form.voiceCallPolicy ?? {}),
                    mode: mode as VoiceCallPolicy['mode'],
                  })}
                  options={[
                    { value: 'always_ask', label: 'Always ask — every call needs my approval' },
                    { value: 'always_autonomous', label: 'Always autonomous — the agent may call without asking' },
                    { value: 'conditional', label: 'Conditional — autonomous only when conditions pass' },
                  ]}
                />
              </Field>
              {form.voiceCallPolicy?.mode === 'conditional' && (
                <>
                  <div className="h-px bg-border" />
                  <Field
                    label="Autonomous call purposes"
                    htmlFor="voicePurposes"
                    hint="Comma-separated purposes allowed without approval (e.g. reminder, follow_up). Anything else — like a full pitch — still asks."
                  >
                    <Input
                      id="voicePurposes"
                      value={(form.voiceCallPolicy?.conditions?.autonomousPurposes ?? []).join(', ')}
                      onChange={e => set('voiceCallPolicy', {
                        mode: 'conditional',
                        conditions: {
                          ...(form.voiceCallPolicy?.conditions ?? {}),
                          autonomousPurposes: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                        },
                      })}
                      placeholder="reminder, follow_up"
                      className="font-mono text-xs"
                    />
                  </Field>
                  <SettingRow
                    label="Known contacts only"
                    description="Autonomous calls only to resolved CRM contacts (never raw numbers)."
                  >
                    <Switch
                      checked={form.voiceCallPolicy?.conditions?.knownContactsOnly !== false}
                      onCheckedChange={(checked) => set('voiceCallPolicy', {
                        mode: 'conditional',
                        conditions: { ...(form.voiceCallPolicy?.conditions ?? {}), knownContactsOnly: checked },
                      })}
                    />
                  </SettingRow>
                  <SettingRow
                    label="Business hours only"
                    description="Autonomous calls only 09:00–18:00 (UTC)."
                  >
                    <Switch
                      checked={form.voiceCallPolicy?.conditions?.businessHoursOnly !== false}
                      onCheckedChange={(checked) => set('voiceCallPolicy', {
                        mode: 'conditional',
                        conditions: { ...(form.voiceCallPolicy?.conditions ?? {}), businessHoursOnly: checked },
                      })}
                    />
                  </SettingRow>
                </>
              )}
            </div>
          </Card>

          {/* WhatsApp control channel (G12 2026-06-05) */}
          <Card icon={MessageCircle} title="Control via WhatsApp" action={
            controlBinding?.status === 'active' ? <Chip tone="ok">Connected</Chip>
              : controlBinding?.status === 'pending' ? <Chip tone="warn">Pairing…</Chip>
              : undefined
          }>
            <div className="space-y-4 px-4 pb-4">
              {controlBinding?.status === 'active' ? (
                <SettingRow
                  label={`Paired phone: +${controlBinding.phone}`}
                  description="Send 'status', 'approve <n>', 'reject <n>', or 'goal <text>' to your brand's WhatsApp number. Ad campaigns and bulk calls stay app-only."
                >
                  <Button variant="outline" size="sm" onClick={handleRevokeControl} disabled={controlBusy}>
                    Disconnect
                  </Button>
                </SettingRow>
              ) : (
                <>
                  <Field
                    label="Your personal WhatsApp number"
                    htmlFor="controlPhone"
                    hint="With country code, e.g. +91 98765 43210. You'll text a pairing code from this phone to your brand's WhatsApp number."
                  >
                    <div className="flex gap-2">
                      <Input
                        id="controlPhone"
                        value={controlPhone}
                        onChange={e => setControlPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        wrapClassName="flex-1"
                      />
                      <Button onClick={handleStartPairing} disabled={controlBusy || !controlPhone.trim()}>
                        {controlBinding?.status === 'pending' ? 'New code' : 'Enable'}
                      </Button>
                    </div>
                  </Field>
                  {pairingInfo && (
                    <Banner tone="info" icon={MessageCircle} title={`Send this from your phone to ${pairingInfo.whatsappNumber}:`}>
                      <span className="font-mono text-base font-semibold">PAIR {pairingInfo.code}</span>
                      <span className="block text-xs text-muted-foreground mt-1">
                        Code expires {new Date(pairingInfo.expiresAt).toLocaleTimeString()} · 3 attempts max
                      </span>
                    </Banner>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Autonomy — display-only, comes from plan */}
          {planLimits && (
            <Card
              icon={Shield}
              title="Autonomy Modes"
              action={<Chip tone="gray">Plan-controlled</Chip>}
              className="opacity-75"
            >
              <div className="px-4 pb-4">
                <div className="space-y-2">
                  {planLimits.allowedAutonomyModes.map(mode => (
                    <div key={mode} className="flex items-center gap-2 text-sm">
                      <Switch checked disabled />
                      <span>{MODE_LABELS[mode] ?? mode}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Autonomy modes are set by your plan. Contact your admin to change them.
                </p>
              </div>
            </Card>
          )}

          {/* Save button */}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="brand" icon={Save} onClick={handleSave} disabled={!isDirty || saving}>
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
            {isDirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
          </div>

          {/* Recurring missions */}
          <RecurringMissionsCard
            configs={recurringConfigs}
            onToggle={handleToggleRecurring}
            onDelete={setRecurringToDelete}
          />

          {/* Event triggers */}
          <EventTriggersCard
            configs={triggerConfigs}
            onToggle={handleToggleTrigger}
            onDelete={setTriggerToDelete}
          />
        </div>
      )}

      <ConfirmDialog
        open={!!recurringToDelete}
        onOpenChange={(o) => { if (!o) setRecurringToDelete(null); }}
        title="Delete recurring mission?"
        description={recurringToDelete ? `"${recurringToDelete.name}" will be removed permanently.` : undefined}
        onConfirm={() => { if (recurringToDelete) return handleDeleteRecurring(recurringToDelete._id); }}
      />

      <ConfirmDialog
        open={!!triggerToDelete}
        onOpenChange={(o) => { if (!o) setTriggerToDelete(null); }}
        title="Delete trigger?"
        description={triggerToDelete ? `"${triggerToDelete.name}" will be removed permanently.` : undefined}
        onConfirm={() => { if (triggerToDelete) return handleDeleteTrigger(triggerToDelete._id); }}
      />
    </div>
  );
}
