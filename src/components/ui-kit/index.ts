/**
 * MontrAI ui-kit — the centralized component library.
 *
 * Single source of truth for UI building blocks. Compose every surface from
 * these components; do not hand-roll buttons / cards / chips / tables inline.
 *
 *   import { Button, Card, KpiTile, Chip } from '@/components/ui-kit';
 *
 * Ported from the v0.6 design mockup (removed) components/. Token-styled
 * (see src/app/globals.css + tailwind.config.ts), icons via lucide-react.
 *
 * See REGISTRY.md for the full catalog + status.
 */

// primitives
export {
  Button,
  IconButton,
  Chip,
  Avatar,
  AvatarStack,
  Input,
  SearchInput,
  Segmented,
  Tabs,
  Meter,
  RateBar,
  Spinner,
  Separator,
} from './primitives';
export type {
  ButtonProps,
  ButtonVariant,
  ButtonSize,
  IconButtonProps,
  ChipProps,
  ChipTone,
  AvatarProps,
  AvatarStackProps,
  InputProps,
  SegmentedProps,
  SegmentedOption,
  TabsProps,
  TabOption,
  MeterProps,
  MeterTone,
  RateBarProps,
  SpinnerProps,
  SeparatorProps,
} from './primitives';

// surfaces
export { Card, KpiTile, StatCard, Table, EmptyState, Skeleton, Banner, CollapsibleSection } from './surfaces';
export type {
  CardProps,
  KpiTileProps,
  Pastel,
  IconTone,
  StatCardProps,
  TableProps,
  TableColumn,
  EmptyStateProps,
  BannerProps,
  BannerTone,
  CollapsibleSectionProps,
} from './surfaces';

// blocks
export {
  KpiRow,
  DealCard,
  PipelineColumn,
  ActivityItem,
  ChatBubble,
  WaPhonePreview,
  FlowNode,
  ConversationItem,
  Timeline,
  MessageComposer,
  Stepper,
  ChatMessage,
} from './blocks';
export type {
  KpiRowProps,
  Deal,
  DealCardProps,
  PipelineStage,
  PipelineColumnProps,
  Activity,
  ActivityTone,
  ChatBubbleProps,
  WaPhonePreviewProps,
  FlowNodeData,
  FlowNodeProps,
  Conversation,
  TimelineProps,
  TimelineItem,
  MessageComposerProps,
  ComposerMode,
  StepperProps,
  ChatMessageProps,
} from './blocks';

// layout
export { PageHeader, Toolbar, FilterBar, BulkBar, Pagination } from './layout';
export type {
  PageHeaderProps,
  ToolbarProps,
  FilterBarProps,
  BulkBarProps,
  PaginationProps,
} from './layout';

// data table
export { DataTable } from './data-table';
export type { DataTableProps, DataTableColumn } from './data-table';

// overlays
export { FormDialog, ConfirmDialog, ActionMenu, DetailPanel } from './overlays';
export type {
  FormDialogProps,
  ConfirmDialogProps,
  ActionMenuProps,
  ActionMenuItem,
  DetailPanelProps,
  DialogSize,
} from './overlays';

// forms
export { Field, Textarea, Select, SettingRow, CopyField, Checkbox, Switch, Label } from './forms';
export type {
  FieldProps,
  TextareaProps,
  SelectProps,
  SelectOption,
  SelectOptionGroup,
  SettingRowProps,
  CopyFieldProps,
  CheckboxProps,
  SwitchProps,
  LabelProps,
} from './forms';

// charts
export { Spark, AreaChart, Donut } from './charts';
export type { SparkProps, ChartSeries, AreaChartProps, DonutSegment, DonutProps } from './charts';

// avatar helpers (non-component module)
export { avatarColor, avatarInitials } from './avatar-helpers';

// bento (Aceternity-derived, token-themed)
export { BentoGrid, BentoItem } from './bento';
export type { BentoGridProps, BentoItemProps } from './bento';

// motion — animated hero heading (motion-primitives)
export { TextEffect } from '@/components/motion-primitives/text-effect';
export type { TextEffectProps, PresetType, PerType } from '@/components/motion-primitives/text-effect';
