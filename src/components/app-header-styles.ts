interface AppHeaderStyleOptions {
  isCanvasPage: boolean;
  isCollapsed: boolean;
}

export function getAppHeaderClassNames({
  isCanvasPage,
  isCollapsed,
}: AppHeaderStyleOptions) {
  const base =
    'app-header-frame z-30 sticky top-0 flex h-[54px] items-center gap-3 px-4 transition-all duration-200 sm:px-[18px]';

  // Rail is a constant 60px; offset the floating canvas header just past it.
  void isCollapsed;
  const canvas = isCanvasPage
    ? `sm:absolute sm:top-4 sm:h-12 sm:w-auto sm:rounded-[18px] sm:border sm:border-white/40 sm:bg-[var(--app-header-bg)] sm:px-4 sm:text-popover-foreground sm:shadow-[var(--app-shadow)] sm:left-[72px]`
    : 'w-full';

  return {
    header: `${base} ${canvas}`,
    titleGroup:
      'flex min-w-0 items-center gap-2 rounded-[10px] border border-transparent px-1 py-1 transition-colors duration-200',
    actionsGroup:
      'flex items-center gap-2',
    searchGroup:
      'flex h-8 items-center rounded-[8px] border border-[color:var(--app-border-strong)] bg-[color:var(--app-surface-strong)] px-1.5 transition-colors duration-200 hover:border-[color:var(--app-border-hover)] focus-within:border-primary/30',
    searchInput:
      'w-[156px] border-none bg-transparent px-2 text-[12px] text-foreground shadow-none transition-all duration-300 ease-in-out placeholder:text-[color:var(--app-text-faint)] focus-visible:w-[220px] focus-visible:ring-0 focus-visible:border-none group-hover:w-[220px]',
    userButton:
      'size-8 overflow-hidden rounded-full border border-white/35 bg-[color:var(--app-surface-strong)] transition-colors hover:border-[color:var(--app-border-hover)]',
  };
}
