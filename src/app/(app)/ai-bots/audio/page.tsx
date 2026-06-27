'use client';

import { useEffect, useMemo, useState } from 'react';
import { PhoneCall, Radio, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { AIBotsShell } from '@/components/ai-bots/ai-bots-shell';
import styles from '@/components/ai-bots/ai-bots.module.css';
import { useAppHeader } from '@/components/app-header';
import { Card, Chip } from '@/components/ui-kit';

const roadmap: Array<{ title: string; description: string; icon: LucideIcon }> = [
  { title: 'Call routing', description: 'Route live calls into support, sales, or after-hours queues.', icon: PhoneCall },
  { title: 'Realtime transcript', description: 'Review every turn, interruption, and fallback in one stream.', icon: Radio },
  { title: 'Voice controls', description: 'Set tone, pronunciations, and handoff rules per bot.', icon: Waves },
];

export default function AudioBotPage() {
  const { setHeaderInfo } = useAppHeader();
  const [audioBots] = useState<Array<{ id: string }>>([]);

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'Voice bots',
      description: '0 voice bots',
    });
    return () => { setHeaderInfo(null); };
  }, [setHeaderInfo]);

  const shellStats = useMemo(
    () => [
      { label: 'Voice bots', value: String(audioBots.length), tone: 'blue' as const },
      { label: 'Phase', value: 'Planned', tone: 'amber' as const },
      { label: 'Channels', value: 'Web + calls', tone: 'violet' as const },
      { label: 'Handoff', value: 'Human', tone: 'emerald' as const },
    ],
    [audioBots.length],
  );

  return (
    <AIBotsShell
      title="Voice bots"
      description="Voice stays staged here until the call runtime and routing layer are ready."
      badge="Planned"
      stats={shellStats}
    >
      <div className="flex flex-col gap-3">
        {/* Planned features */}
        <Card>
          <div className="flex flex-col gap-3 p-4">
            <div>
              <h2 className="text-sm font-semibold tracking-[-0.015em]">Roadmap</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                These are the first capabilities landing in the voice workspace.
              </p>
            </div>

            <div className="flex flex-col">
              {roadmap.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-start gap-2.5 border-t border-border py-2.5 first:border-t-0"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-muted text-brand-strong">
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold text-foreground">{item.title}</div>
                      <div className="text-[13px] text-muted-foreground">{item.description}</div>
                    </div>
                    <Chip tone="gray">Planned</Chip>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Status panel */}
        <Card>
          <div className={styles.secondarySplit} style={{ padding: 16 }}>
            <div>
              <h2 className="text-sm font-semibold tracking-[-0.015em]">Current status</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                The page is ready, but creation stays disabled until the runtime and delivery layer are available.
              </p>
              <div className="mt-3">
                <Chip tone="gray">Planned</Chip>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { title: 'Shared sources', desc: 'Docs, forms, and model selection stay aligned with website bots.' },
                { title: 'Human handoff', desc: 'Support and sales queues stay available as the fallback path.' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-border bg-secondary px-3 py-2.5">
                  <div className="text-[12.5px] font-semibold text-foreground">{item.title}</div>
                  <div className="text-[13px] text-muted-foreground">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </AIBotsShell>
  );
}
