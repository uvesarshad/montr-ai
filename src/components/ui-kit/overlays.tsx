'use client';

/**
 * ui-kit · overlays — dialogs, menus and panels: FormDialog, ConfirmDialog,
 * ActionMenu, DetailPanel.
 *
 * Thin, opinionated wrappers over the shadcn primitives (Radix underneath)
 * that kill the per-module boilerplate: every module was re-wiring
 * Dialog + footer buttons + busy state by hand. Buttons are kit Buttons.
 */

import * as React from 'react';
import { MoreHorizontal, X, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button, IconButton, Spinner } from './primitives';

/* -------------------------------------------------------------- FormDialog */

export type DialogSize = 'sm' | 'md' | 'lg';

const DIALOG_SIZES: Record<DialogSize, string> = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[520px]',
  lg: 'sm:max-w-[680px]',
};

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Form body — kit Field/Input/Select/Textarea rows. */
  children?: React.ReactNode;
  /**
   * Submit handler. May return a promise — the dialog shows a busy state and
   * closes on resolve (stays open on reject so errors remain visible).
   */
  onSubmit: () => void | Promise<void>;
  submitLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  submitDisabled?: boolean;
  /** External busy override (e.g. react-query mutation pending). */
  submitting?: boolean;
  /** Red submit for destructive forms. */
  destructive?: boolean;
  /** Set false to keep the dialog open after a successful async submit (multi-step / result-showing dialogs). */
  closeOnSuccess?: boolean;
  size?: DialogSize;
  className?: string;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  children,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  submitDisabled,
  submitting,
  destructive,
  closeOnSuccess = true,
  size = 'md',
  className,
}: FormDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const pending = submitting ?? busy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = onSubmit();
    if (result instanceof Promise) {
      setBusy(true);
      try {
        await result;
        if (closeOnSuccess) onOpenChange(false);
      } catch {
        // leave the dialog open; the caller surfaces the error (toast/field)
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent className={cn(DIALOG_SIZES[size], className)}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-[15.5px] tracking-[-0.015em]">
              {Icon ? (
                <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-brand-muted text-brand-strong">
                  <Icon className="h-[15px] w-[15px]" />
                </span>
              ) : null}
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="text-[13px]">{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="flex flex-col gap-3.5 py-4">{children}</div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={submitDisabled || pending}
              className={cn(destructive && 'border-danger bg-danger text-danger-foreground hover:opacity-90')}
            >
              {pending ? <Spinner size={13} className="border-current" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- ConfirmDialog */

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** May return a promise — busy state until it settles, closes on resolve. */
  onConfirm: () => void | Promise<void>;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  /** Red confirm (deletes etc.). Default true — most confirms are destructive. */
  destructive?: boolean;
  /** Extra content between the description and the footer (input, warning Banner). */
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  children,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);

  const handleConfirm = async () => {
    const result = onConfirm();
    if (result instanceof Promise) {
      setBusy(true);
      try {
        await result;
        onOpenChange(false);
      } catch {
        // stay open on failure
      } finally {
        setBusy(false);
      }
    } else {
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <AlertDialogContent className="sm:max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[15.5px] tracking-[-0.015em]">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-[13px]">{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {children ? <div className="flex flex-col gap-3 py-1">{children}</div> : null}
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={busy}
            className={cn(destructive && 'border-danger bg-danger text-danger-foreground hover:opacity-90')}
          >
            {busy ? <Spinner size={13} className="border-current" /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* -------------------------------------------------------------- ActionMenu */

export interface ActionMenuItem {
  label: React.ReactNode;
  icon?: LucideIcon;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Renders a separator above this item. */
  separatorBefore?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Custom trigger; defaults to a ⋯ IconButton. */
  trigger?: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  triggerAriaLabel?: string;
  /** Fired when the menu opens/closes — useful for lazy-loading item data on open. */
  onOpenChange?: (open: boolean) => void;
}

/** Row-action ⋯ menu — the DropdownMenu boilerplate, once. */
export function ActionMenu({ items, trigger, align = 'end', triggerAriaLabel = 'Actions', onOpenChange }: ActionMenuProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {trigger ?? <IconButton icon={MoreHorizontal} iconSize={16} aria-label={triggerAriaLabel} />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[170px]">
        {items.map((item, i) => (
          <React.Fragment key={i}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              onSelect={item.onSelect}
              disabled={item.disabled}
              className={cn('gap-2 text-[13px]', item.danger && 'text-danger focus:text-danger')}
            >
              {item.icon ? <item.icon className="size-3.5" /> : null}
              {item.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------- DetailPanel */

export interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  icon?: LucideIcon;
  /** Muted text after the title. */
  meta?: React.ReactNode;
  /** Header action cluster (before the ✕). */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  /** Panel width in px (desktop). */
  width?: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Right-side detail aside for list→detail screens (contact/deal/node config).
 * Renders inline in a flex row — place it as the last sibling of the list.
 * (For mobile overlays wrap your usage in a shadcn Sheet instead.)
 */
export function DetailPanel({
  open,
  onClose,
  title,
  icon: Icon,
  meta,
  actions,
  footer,
  width = 360,
  className,
  children,
}: DetailPanelProps) {
  if (!open) return null;
  return (
    <aside
      style={{ width }}
      className={cn('flex min-h-0 shrink-0 flex-col border-l border-border bg-card', className)}
    >
      <div className="flex h-[54px] shrink-0 items-center gap-2.5 border-b border-border px-4">
        {Icon ? (
          <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] bg-brand-muted text-brand-strong">
            <Icon className="h-[15px] w-[15px]" />
          </span>
        ) : null}
        <span className="min-w-0 truncate text-sm font-semibold tracking-[-0.015em]">{title}</span>
        {meta ? <span className="shrink-0 text-[12.5px] text-muted-foreground">{meta}</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {actions}
          <IconButton icon={X} iconSize={16} onClick={onClose} aria-label="Close panel" />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      {footer ? (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-[var(--app-bg)] px-4 py-3">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
