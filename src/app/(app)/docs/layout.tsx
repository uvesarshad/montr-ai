'use client';

import React from 'react';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  // The DocsSidebar has been removed and its functionality merged into the main AppSidebar.
  // This layout now simply provides a main content area for the doc pages.
  return (
    <div className="flex-1 h-full">
      {children}
    </div>
  );
}
