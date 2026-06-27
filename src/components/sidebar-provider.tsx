'use client';

import React, { createContext, useContext } from 'react';

/**
 * The primary Rail is now a constant 60px icon strip that hover-expands as an
 * overlay (see `components/shell/rail.tsx`) — there is no push/collapse state
 * any more. A few surfaces (e.g. the canvas toolbar dialogs) still read
 * `isCollapsed` to position themselves next to the narrow rail, so this hook is
 * kept with a stable, constant value rather than removed outright.
 */

interface SidebarContextType {
  isCollapsed: boolean;
  isManuallyCollapsed: boolean;
  toggleCollapse: () => void;
  setIsCollapsed: (value: boolean) => void;
  setHoverExpanded: (value: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

// Hoisted module constant — the value never changes, so there's nothing to
// re-create per render (no new object identity → no consumer re-renders).
const SIDEBAR_VALUE: SidebarContextType = {
  isCollapsed: true,
  isManuallyCollapsed: true,
  toggleCollapse: () => {},
  setIsCollapsed: () => {},
  setHoverExpanded: () => {},
};

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  return <SidebarContext.Provider value={SIDEBAR_VALUE}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
