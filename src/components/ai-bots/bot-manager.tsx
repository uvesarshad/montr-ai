'use client';

/**
 * Cross-channel AI bot manager (B3-4.5.5).
 *
 * Lists AiBot entities for the current org/brand, supports create / edit /
 * archive, and exposes a quick "test turn" dialog.
 */

import { useEffect, useState, useCallback, useReducer } from 'react';
import {
  Pencil,
  Play,
  Plus,
  MessageSquare,
  Phone,
  Inbox as InboxIcon,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  ActionMenu,
  Avatar,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  Field,
  FormDialog,
  Input,
  PageHeader,
  Skeleton,
  Spinner,
  Textarea,
} from '@/components/ui-kit';
import { Checkbox } from '@/components/ui/checkbox';

import type { AiBotChannel } from '@/lib/db/models/ai-bot.model';

interface AiBotListItem {
  _id: string;
  name: string;
  description?: string;
  enabledChannels: AiBotChannel[];
  status: 'active' | 'archived';
  updatedAt: string;
  brandId?: string | null;
  aiCharacterId?: string | null;
}

interface BotFormState {
  name: string;
  description: string;
  systemPrompt: string;
  enabledChannels: AiBotChannel[];
  aiCharacterId: string;
  llmModel: string;
}

const EMPTY_FORM: BotFormState = {
  name: '',
  description: '',
  systemPrompt: '',
  enabledChannels: ['inbox'],
  aiCharacterId: '',
  llmModel: '',
};

const CHANNEL_ICON: Record<AiBotChannel, LucideIcon> = {
  whatsapp: MessageSquare,
  inbox: InboxIcon,
  voice: Phone,
};

interface TestState {
  testingId: string | null;
  message: string;
  reply: string | null;
  latency: number | null;
  running: boolean;
}

type TestAction =
  | { type: 'open'; id: string }
  | { type: 'close' }
  | { type: 'setMessage'; message: string }
  | { type: 'start' }
  | { type: 'result'; reply: string; latency: number | null }
  | { type: 'finish' };

const INITIAL_TEST_STATE: TestState = {
  testingId: null,
  message: '',
  reply: null,
  latency: null,
  running: false,
};

function testReducer(state: TestState, action: TestAction): TestState {
  switch (action.type) {
    case 'open':
      return { testingId: action.id, message: '', reply: null, latency: null, running: false };
    case 'close':
      return INITIAL_TEST_STATE;
    case 'setMessage':
      return { ...state, message: action.message };
    case 'start':
      return { ...state, running: true, reply: null, latency: null };
    case 'result':
      return { ...state, reply: action.reply, latency: action.latency };
    case 'finish':
      return { ...state, running: false };
    default:
      return state;
  }
}

function BotCard({
  bot,
  onTest,
  onEdit,
  onArchive,
}: {
  bot: AiBotListItem;
  onTest: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <Card lift>
      <div className="flex items-center gap-3 p-4">
        <Avatar name={bot.name} size={40} square />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{bot.name}</h3>
            {bot.status === 'archived' ? <Chip tone="gray">Archived</Chip> : null}
          </div>
          {bot.description ? (
            <p className="truncate text-[13px] text-muted-foreground">{bot.description}</p>
          ) : null}
          <div className="mt-2 flex items-center gap-1.5">
            {bot.enabledChannels.map((c) => (
              <Chip key={c} tone="gray" icon={CHANNEL_ICON[c]} className="capitalize">
                {c}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" icon={Play} onClick={onTest}>
            Test
          </Button>
          <ActionMenu
            items={[
              { label: 'Edit', icon: Pencil, onSelect: onEdit },
              {
                label: 'Archive',
                icon: Trash2,
                danger: true,
                separatorBefore: true,
                onSelect: onArchive,
              },
            ]}
          />
        </div>
      </div>
    </Card>
  );
}

export function BotManager() {
  const [bots, setBots] = useState<AiBotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BotFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [test, dispatchTest] = useReducer(testReducer, INITIAL_TEST_STATE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/ai-bots');
      if (!res.ok) throw new Error('Failed to load bots');
      const json = await res.json();
      setBots(json.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  async function openEdit(id: string) {
    try {
      const res = await fetch(`/api/v2/ai-bots/${id}`);
      if (!res.ok) throw new Error('Failed to load bot');
      const json = await res.json();
      const b = json.data;
      setForm({
        name: b.name ?? '',
        description: b.description ?? '',
        systemPrompt: b.systemPrompt ?? '',
        enabledChannels: b.enabledChannels ?? [],
        aiCharacterId: b.aiCharacterId ?? '',
        llmModel: b.llmModel ?? '',
      });
      setEditingId(id);
      setEditorOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  function toggleChannel(channel: AiBotChannel, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      enabledChannels: checked
        ? Array.from(new Set([...prev.enabledChannels, channel]))
        : prev.enabledChannels.filter((c) => c !== channel),
    }));
  }

  async function save() {
    if (!form.name.trim() || !form.systemPrompt.trim()) {
      toast.error('Name and system prompt are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        systemPrompt: form.systemPrompt,
        enabledChannels: form.enabledChannels,
        aiCharacterId: form.aiCharacterId.trim() || null,
        llmModel: form.llmModel.trim() || undefined,
      };
      const url = editingId ? `/api/v2/ai-bots/${editingId}` : '/api/v2/ai-bots';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Save failed');
      }
      toast.success(editingId ? 'Bot updated' : 'Bot created');
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    const res = await fetch(`/api/v2/ai-bots/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Failed to archive');
      throw new Error('Failed to archive');
    }
    toast.success('Bot archived');
    await load();
  }

  async function runTest(id: string) {
    if (!test.message.trim()) {
      toast.error('Enter a test message.');
      return;
    }
    dispatchTest({ type: 'start' });
    try {
      const res = await fetch(`/api/v2/ai-bots/${id}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: test.message, channel: 'inbox' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Test failed');
      dispatchTest({ type: 'result', reply: json.reply ?? '(no reply)', latency: json.latencyMs ?? null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      dispatchTest({ type: 'finish' });
    }
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="AI Bots"
        sub="Cross-channel conversational bots. Assign one to a WhatsApp account, inbox channel, or voice phone number from that channel's settings."
        actions={
          <Button variant="brand" icon={Plus} onClick={openCreate}>
            New bot
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }, (_, i) => i).map((i) => (
            <Skeleton key={i} className="h-[88px] rounded-lg" />
          ))}
        </div>
      ) : bots.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="No AI bots yet"
            note="Create a cross-channel bot and assign it to WhatsApp, inbox, or voice from that channel's settings."
            cta={
              <Button variant="brand" icon={Plus} onClick={openCreate}>
                Create your first bot
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {bots.map((bot) => (
            <BotCard
              key={bot._id}
              bot={bot}
              onTest={() => dispatchTest({ type: 'open', id: bot._id })}
              onEdit={() => void openEdit(bot._id)}
              onArchive={() => setArchiveId(bot._id)}
            />
          ))}
        </div>
      )}

      <FormDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingId ? 'Edit bot' : 'New bot'}
        icon={MessageSquare}
        size="lg"
        submitLabel={editingId ? 'Save' : 'Create'}
        submitting={saving}
        submitDisabled={!form.name.trim() || !form.systemPrompt.trim()}
        onSubmit={save}
      >
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Support bot"
          />
        </Field>
        <Field label="Description">
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What this bot does"
          />
        </Field>
        <Field label="System prompt">
          <Textarea
            rows={8}
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            placeholder="You are a helpful customer support agent for…"
          />
        </Field>
        <Field label="Enabled channels">
          <div className="mt-1 flex gap-4">
            {(['whatsapp', 'inbox', 'voice'] as AiBotChannel[]).map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 text-[13px]">
                <Checkbox
                  checked={form.enabledChannels.includes(c)}
                  onCheckedChange={(checked) => toggleChannel(c, checked === true)}
                />
                <span className="capitalize">{c}</span>
              </label>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="AI Character id (optional)">
            <Input
              value={form.aiCharacterId}
              onChange={(e) => setForm({ ...form, aiCharacterId: e.target.value })}
              placeholder="ObjectId of an AiCharacter"
            />
          </Field>
          <Field label="LLM model id (optional)">
            <Input
              value={form.llmModel}
              onChange={(e) => setForm({ ...form, llmModel: e.target.value })}
              placeholder="claude-haiku-4-5-20251001"
            />
          </Field>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={archiveId !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveId(null);
        }}
        title="Archive this bot?"
        description="Channels assigned to it will fall back to default behavior."
        confirmLabel="Archive"
        onConfirm={async () => {
          if (archiveId) await archive(archiveId);
        }}
      />

      <FormDialog
        open={test.testingId !== null}
        onOpenChange={(open) => {
          if (!open) dispatchTest({ type: 'close' });
        }}
        title="Test bot turn"
        icon={Play}
        submitLabel="Send"
        submitDisabled={test.running || !test.message.trim()}
        onSubmit={() => {
          // Fire-and-forget: keep the dialog open so the reply stays visible.
          if (test.testingId) void runTest(test.testingId);
        }}
      >
        <Field label="Inbound message">
          <Textarea
            rows={3}
            placeholder="Inbound message…"
            value={test.message}
            onChange={(e) => dispatchTest({ type: 'setMessage', message: e.target.value })}
          />
        </Field>
        {test.running ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Spinner size={14} /> Generating reply…
          </div>
        ) : null}
        {test.reply ? (
          <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-[13px]">
            {test.reply}
            {test.latency != null ? (
              <div className="mt-2 text-xs text-muted-foreground">{test.latency}ms</div>
            ) : null}
          </div>
        ) : null}
      </FormDialog>
    </div>
  );
}
