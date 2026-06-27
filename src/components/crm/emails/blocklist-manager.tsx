'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Input, EmptyState, Spinner } from '@/components/ui-kit';
import { ShieldBan, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface BlocklistEntry {
  id: string;
  pattern: string;
  reason?: string;
  createdAt: string;
}

/**
 * Manage the email-sync sender blocklist: list patterns, add an email or
 * `@domain` pattern, and remove entries. Sync respects these — blocked senders
 * are stored but never linked or used to auto-create contacts.
 */
export function BlocklistManager() {
  const [entries, setEntries] = useState<BlocklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pattern, setPattern] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v2/crm/blocklist');
      if (!res.ok) throw new Error('Failed to load blocklist');
      const json = await res.json();
      setEntries(json.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load blocklist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleAdd = async () => {
    const value = pattern.trim();
    if (!value) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v2/crm/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: value }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to add pattern');
      }
      setPattern('');
      toast.success('Sender blocked');
      await fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add pattern');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      const res = await fetch(`/api/v2/crm/blocklist/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove pattern');
      toast.success('Pattern removed');
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove pattern');
    }
  };

  return (
    <Card icon={ShieldBan} title="Sender blocklist">
      <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
        Block an email or a whole domain (e.g. @example.com). Blocked senders are still stored but
        never linked or auto-created as contacts.
      </p>
      <div className="flex items-center gap-2">
        <Input
          placeholder="spammer@example.com or @example.com"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button icon={Plus} onClick={handleAdd} disabled={submitting || !pattern.trim()}>
          Block
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState icon={ShieldBan} title="No blocked senders" note="Add a pattern above to start blocking." />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate text-[13.5px] font-medium">{entry.pattern}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  onClick={() => handleRemove(entry.id)}
                  aria-label={`Remove ${entry.pattern}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
