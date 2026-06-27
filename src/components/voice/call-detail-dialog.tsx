/**
 * Call detail dialog — shown when a call row in the voice history is clicked.
 * Plays the recording (proxied via /api/v2/voice/calls/[id]/recording) and
 * shows the transcript inline.
 */

'use client';

import useSWR from 'swr';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface CallSummary {
  _id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  fromNumber: string;
  toNumber: string;
  startedAt?: string;
  endedAt?: string;
  durationSec?: number;
  recordingUrl?: string | null;
  transcriptId?: string | null;
  disposition?: { outcome?: string; sentiment?: string };
}

interface TranscriptDoc {
  transcript: {
    _id: string;
    segments: Array<{
      speaker: string;
      text: string;
      startSec: number;
      endSec: number;
    }>;
    plainText: string;
    summary?: { text: string; keyPoints?: string[]; actionItems?: string[] };
    status: string;
  } | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
};

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CallDetailDialog({
  call,
  onOpenChange,
}: {
  call: CallSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: transcriptData, isLoading } = useSWR<TranscriptDoc>(
    call ? `/api/v2/voice/calls/${call._id}/transcript` : null,
    async (url: string) => {
      const res = await fetch(url);
      if (res.status === 404) return { transcript: null } as TranscriptDoc;
      if (!res.ok) throw new Error('Fetch failed');
      return res.json();
    },
  );

  void fetcher; // satisfy unused warning if useSWR is changed later

  return (
    <Dialog open={!!call} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {call?.direction === 'outbound' ? 'Outbound call' : 'Inbound call'} ·{' '}
            <Badge variant="secondary">{call?.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        {!call ? null : (
          <div className="space-y-4">
            <div className="text-sm grid grid-cols-2 gap-2">
              <div>
                <div className="text-muted-foreground text-xs">From</div>
                <div>{call.fromNumber}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">To</div>
                <div>{call.toNumber}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Started</div>
                <div>{call.startedAt ? new Date(call.startedAt).toLocaleString() : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Duration</div>
                <div>
                  {typeof call.durationSec === 'number' ? fmtSec(call.durationSec) : '—'}
                </div>
              </div>
            </div>

            {call.recordingUrl && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Recording</div>
                <audio
                  controls
                  src={`/api/v2/voice/calls/${call._id}/recording`}
                  className="w-full"
                />
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Transcript</div>
              {isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : transcriptData?.transcript ? (
                <div className="max-h-64 overflow-y-auto border rounded-md p-3 text-sm space-y-2">
                  {transcriptData.transcript.summary && (
                    <div className="border-l-2 pl-3 italic text-muted-foreground">
                      <div className="text-xs uppercase font-semibold">Summary</div>
                      {transcriptData.transcript.summary.text}
                    </div>
                  )}
                  {transcriptData.transcript.segments.length === 0 ? (
                    <div className="text-muted-foreground">
                      Transcript {transcriptData.transcript.status === 'processing'
                        ? 'still processing…'
                        : 'is empty.'}
                    </div>
                  ) : (
                    transcriptData.transcript.segments.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-xs text-muted-foreground w-12 shrink-0">
                          {fmtSec(Math.floor(s.startSec))}
                        </span>
                        <span className="font-medium w-16 shrink-0 capitalize">{s.speaker}:</span>
                        <span>{s.text}</span>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No transcript available.</div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
