'use client';

/**
 * ui-kit · forms — form-row building blocks: Field wrapper, kit-styled
 * Textarea, options-array Select, SettingRow.
 *
 * Select wraps the shadcn primitive (Radix underneath) but takes a plain
 * `options` array so pages stop repeating the Trigger/Value/Content/Item
 * boilerplate. Visuals match the kit Input (h-8, rounded-md, border-input,
 * brand focus ring).
 */

import * as React from 'react';
import { Check, Copy, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Select as SelectRoot,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox as ShadCheckbox } from '@/components/ui/checkbox';
import { Switch as ShadSwitch } from '@/components/ui/switch';
import { IconButton } from './primitives';

/* ------------------------------------------------------------------- Field */

export interface FieldProps {
  label?: React.ReactNode;
  /** Muted helper line under the control. */
  hint?: React.ReactNode;
  /** Validation error — replaces the hint, turns the row red. */
  error?: React.ReactNode;
  required?: boolean;
  /** Links the label to the control. */
  htmlFor?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-foreground">
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-[12px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Textarea */

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  wrapClassName?: string;
}

/** Multiline twin of the kit Input — same border/focus treatment. */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, wrapClassName, rows = 3, ...rest },
  ref,
) {
  return (
    <div
      className={cn(
        'flex rounded-md border border-input bg-card px-2.5 py-2 transition-colors',
        'focus-within:border-brand focus-within:ring-2 focus-within:ring-ring/40',
        wrapClassName,
      )}
    >
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          'min-w-0 flex-1 resize-y bg-transparent text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground',
          className,
        )}
        {...rest}
      />
    </div>
  );
});

/* ------------------------------------------------------------------ Select */

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SelectOptionGroup {
  label: React.ReactNode;
  options: SelectOption[];
}

export interface SelectProps {
  /** Flat options, or groups (`{label, options}`) for grouped pickers. */
  options: SelectOption[] | SelectOptionGroup[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  className?: string;
  'aria-label'?: string;
}

const isGrouped = (options: SelectOption[] | SelectOptionGroup[]): options is SelectOptionGroup[] =>
  options.length > 0 && 'options' in options[0];

function SelectItems({ options }: { options: SelectOption[] }) {
  return (
    <>
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value} disabled={o.disabled} className="text-[13px]">
          <span className="flex items-center gap-2">
            {o.icon ? <o.icon className="size-3.5 text-muted-foreground" /> : null}
            {o.label}
          </span>
        </SelectItem>
      ))}
    </>
  );
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled,
  triggerClassName,
  className,
  'aria-label': ariaLabel,
}: SelectProps) {
  return (
    <SelectRoot value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          'h-8 rounded-md border-input bg-card px-2.5 text-[13px] shadow-none',
          'focus:border-brand focus:ring-2 focus:ring-ring/40 focus:ring-offset-0',
          triggerClassName,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={className}>
        {isGrouped(options) ? (
          options.map((g, gi) => (
            <SelectGroup key={g.options[0]?.value ?? gi}>
              <SelectLabel className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {g.label}
              </SelectLabel>
              <SelectItems options={g.options} />
            </SelectGroup>
          ))
        ) : (
          <SelectItems options={options} />
        )}
      </SelectContent>
    </SelectRoot>
  );
}

/* --------------------------------------------------------------- CopyField */

export interface CopyFieldProps {
  value: string;
  /** Visually mask the value (secrets). */
  secret?: boolean;
  className?: string;
}

/** Read-only value + copy button with ✓ feedback — share links, API keys. */
export function CopyField({ value, secret, className }: CopyFieldProps) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable — leave silently; caller may add a toast
    }
  };

  return (
    <div
      className={cn(
        'flex h-8 items-center gap-1 rounded-md border border-input bg-muted/40 pl-2.5 pr-1',
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground">
        {secret ? '•'.repeat(Math.min(24, Math.max(8, value.length))) : value}
      </span>
      <IconButton
        icon={copied ? Check : Copy}
        iconSize={14}
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy'}
        className={cn('size-6', copied && 'text-success')}
      />
    </div>
  );
}

/* -------------------------------------------------------------- SettingRow */

export interface SettingRowProps {
  label: React.ReactNode;
  /** Muted explanation under the label. */
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** The control — typically a shadcn `Switch`, or any small input. */
  children?: React.ReactNode;
  className?: string;
}

/* ---------------------------------------------------------------- Checkbox */

export type CheckboxProps = React.ComponentPropsWithoutRef<typeof ShadCheckbox>;

/** Brand-tinted checkbox (Radix underneath). Pairs with `checked` / `onCheckedChange`. */
export const Checkbox = React.forwardRef<React.ElementRef<typeof ShadCheckbox>, CheckboxProps>(
  function Checkbox({ className, ...rest }, ref) {
    return (
      <ShadCheckbox
        ref={ref}
        className={cn(
          'size-4 rounded-[5px] border-input',
          'data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-brand-foreground',
          className,
        )}
        {...rest}
      />
    );
  },
);

/* ------------------------------------------------------------------ Switch */

export type SwitchProps = React.ComponentPropsWithoutRef<typeof ShadSwitch>;

/** Brand-tinted toggle (Radix underneath). Pairs with `checked` / `onCheckedChange`. */
export const Switch = React.forwardRef<React.ElementRef<typeof ShadSwitch>, SwitchProps>(
  function Switch({ className, ...rest }, ref) {
    return <ShadSwitch ref={ref} className={cn('data-[state=checked]:bg-brand', className)} {...rest} />;
  },
);

/* ------------------------------------------------------------------- Label */

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

/** Standalone form label — matches the kit Field label (use Field for full rows). */
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, ...rest },
  ref,
) {
  return (
    <label ref={ref} className={cn('text-[12.5px] font-medium leading-none text-foreground', className)} {...rest} />
  );
});

/* -------------------------------------------------------------- SettingRow */

/** Settings-page row: label + description left, control right. */
export function SettingRow({ label, description, icon: Icon, children, className }: SettingRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-[15px] w-[15px]" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium">{label}</div>
          {description ? (
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
