'use client';

/**
 * ShellContext — shared chrome state for the app shell.
 *
 * Currently just the SubNav open/closed flag (mockup: collapse via the
 * ChevronsLeft button in the SubNav head, re-expand via the ChevronRight
 * button at the Topbar's far left). Re-opens automatically when the user
 * switches modules, matching the mockup's `setSubClosed(false)` on pick.
 */

import * as React from 'react';
import { usePathname } from 'next/navigation';

interface ShellContextValue {
  subnavOpen: boolean;
  setSubnavOpen: (open: boolean) => void;
}

const ShellContext = React.createContext<ShellContextValue>({
  subnavOpen: true,
  setSubnavOpen: () => {},
});

export function useShell() {
  return React.useContext(ShellContext);
}

/** First path segment — the module the pathname belongs to. */
function moduleOf(pathname: string) {
  return pathname.split('/')[1] ?? '';
}

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [subnavOpen, setSubnavOpen] = React.useState(true);

  // Re-open the SubNav whenever the user moves to a different module.
  const currentModule = moduleOf(pathname);
  const lastModule = React.useRef(currentModule);
  React.useEffect(() => {
    if (lastModule.current !== currentModule) {
      lastModule.current = currentModule;
      setSubnavOpen(true);
    }
  }, [currentModule]);

  const value = React.useMemo(() => ({ subnavOpen, setSubnavOpen }), [subnavOpen]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
