'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface CrmKeyboardOptions {
  onSearch?: () => void;
  onNew?: () => void;
  onHelp?: () => void;
  onEscape?: () => void;
  disabled?: boolean;
}

export function useCrmKeyboard(options: CrmKeyboardOptions = {}) {
  const { onSearch, onNew, onHelp, onEscape, disabled } = options;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return;

      // Skip if typing in an input / textarea / contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        if (e.key === 'Escape') onEscape?.();
        return;
      }

      // No modifier keys (except Shift for ?)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          onSearch?.();
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          onNew?.();
          break;
        case '?':
          e.preventDefault();
          onHelp?.();
          break;
        case 'Escape':
          onEscape?.();
          break;
      }
    },
    [disabled, onSearch, onNew, onHelp, onEscape]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export interface CrmNavKeyboardOptions {
  disabled?: boolean;
}

export function useCrmNavKeyboard(options: CrmNavKeyboardOptions = {}) {
  const router = useRouter();
  const { disabled } = options;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return;

      if (!e.altKey || e.ctrlKey || e.metaKey) return;

      switch (e.key) {
        case 'c':
          e.preventDefault();
          router.push('/crm/contacts');
          break;
        case 'o':
          e.preventDefault();
          router.push('/crm/companies');
          break;
        case 'd':
          e.preventDefault();
          router.push('/crm/deals');
          break;
        case 'a':
          e.preventDefault();
          router.push('/crm/activities');
          break;
      }
    },
    [disabled, router]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
