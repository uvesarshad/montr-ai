'use client';

import * as React from 'react';
import { GlobalSearchDialog } from './global-search-dialog';

interface GlobalSearchContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const GlobalSearchContext = React.createContext<GlobalSearchContextValue | null>(
  null,
);

export function useGlobalSearch(): GlobalSearchContextValue {
  const ctx = React.useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error(
      'useGlobalSearch must be used inside <GlobalSearchProvider>',
    );
  }
  return ctx;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function GlobalSearchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const value = React.useMemo<GlobalSearchContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((v) => !v),
    }),
    [open],
  );

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K — works even from inputs (so the user can summon it from any field)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      // "/" — only when not typing in an input/textarea/contenteditable
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      <GlobalSearchDialog open={open} onOpenChange={setOpen} />
    </GlobalSearchContext.Provider>
  );
}
