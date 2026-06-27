'use client';

import { Sparkles } from 'lucide-react';

import { Button, Chip } from '@/components/ui-kit';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MissionTemplate } from '@/lib/agent/mission-templates';

interface MissionTemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: MissionTemplate[];
  onSelectTemplate: (template: MissionTemplate) => void;
}

export function MissionTemplatePicker({
  open,
  onOpenChange,
  templates,
  onSelectTemplate,
}: MissionTemplatePickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border/70 bg-background p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" />
            Mission templates
          </DialogTitle>
          <DialogDescription>
            Start from a structured mission brief instead of a blank workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 px-6 py-5 md:grid-cols-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelectTemplate(template)}
              className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand/25 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{template.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{template.description}</div>
                </div>
                <Chip tone="brand" className="shrink-0">
                  {template.badgeLabel}
                </Chip>
              </div>
              <div className="mt-4 text-[11px] leading-5 text-muted-foreground">
                {template.summary}
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end border-t border-border px-6 py-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
