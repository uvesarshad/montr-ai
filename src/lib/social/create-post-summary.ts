export interface CreatePostSummaryStateInput {
  isExpanded: boolean;
  blockersCount: number;
  warningsCount: number;
}

export function getCreatePostSummaryState({
  isExpanded,
  blockersCount,
  warningsCount,
}: CreatePostSummaryStateInput) {
  const issueCount = blockersCount + warningsCount;

  return {
    toggleLabel: isExpanded ? 'Hide composer summary' : 'Show composer summary',
    helperText:
      issueCount === 0
        ? 'Ready for drafting'
        : `${issueCount} item${issueCount === 1 ? '' : 's'} need attention`,
    tone:
      blockersCount > 0
        ? 'critical'
        : warningsCount > 0
          ? 'warning'
          : 'ready',
  } as const;
}
