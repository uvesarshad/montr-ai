# Component Library

> Scope: The canonical ui-kit in src/components/ui-kit/, the underlying shadcn primitives in src/components/ui/, and key composite components.
> Rendering context: Client-side
> Project tier: 4
> Last updated: 2026-06-04

## Overview

MontrAI composes all UI from the centralized ui-kit at src/components/ui-kit/ (catalog: src/components/ui-kit/REGISTRY.md). The shadcn-style primitives in src/components/ui/ remain underneath it, used only for the lower-level Radix primitives the kit does not cover. Higher-order composite components (forms, data grid, CRM components) live in src/components/<module>/.

AGENT NOTE: Do not import directly from @radix-ui/* in feature components. Use the ui-kit (or, for primitives it does not cover, the shadcn wrappers in src/components/ui/). This ensures consistent styling and dark mode support.

## ui-kit — src/components/ui-kit/ (canonical)

The centralized component library. Everything imports from the @/components/ui-kit barrel. The full catalog with per-component props is the source of truth.

AGENT SEE: src/components/ui-kit/REGISTRY.md for the full catalog and props. This doc does not duplicate the per-component prop tables.

Component groups:
- primitives (primitives.tsx) — Button, IconButton, Chip, Avatar, AvatarStack, Input, SearchInput, Segmented, Tabs, Meter, Spinner.
- surfaces (surfaces.tsx) — Card, KpiTile, StatCard, Table, EmptyState, Skeleton.
- blocks (blocks.tsx) — KpiRow, DealCard, PipelineColumn, ActivityItem, ChatBubble, WaPhonePreview, FlowNode, ConversationItem.
- charts (charts.tsx) — Spark, AreaChart, Donut (dependency-free SVG charts; recharts still available for richer needs).

The kit depends on the design tokens in src/app/globals.css and tailwind.config.ts, and takes lucide-react icon components as props (icon={Plus}, never a string name).

AGENT NOTE: Never hand-roll buttons, cards, chips, inputs, or tables in a page — a raw button with a className or a card-shaped div is a smell. Compose from the ui-kit. If a needed component is missing, add it to src/components/ui-kit/, export it from index.ts, document it in REGISTRY.md, then use it. Do not inline a one-off.

## Underlying primitives — src/components/ui/

shadcn-style components built on Radix UI primitives. These sit underneath the ui-kit and are used directly only for primitives the kit does not cover — Dialog, DropdownMenu, Sheet, Popover, Form, and Tooltip-class components. Prefer the ui-kit for buttons, cards, chips, inputs, tables, avatars, and metrics.

accordion.tsx — Collapsible content sections. Built on @radix-ui/react-accordion.
alert-dialog.tsx — Destructive action confirmation dialog. Built on @radix-ui/react-alert-dialog.
alert.tsx — Inline alert banner with variant support (default, destructive).
avatar.tsx — User avatar with image and fallback initials. Built on @radix-ui/react-avatar.
badge.tsx — Inline label chip with color variants.
button.tsx — Primary interactive element. Variants: default, destructive, outline, secondary, ghost, link. Sizes: default, sm, lg, icon.
calendar.tsx — Date picker calendar widget. Built on react-day-picker.
card.tsx — Container with header, content, and footer slots.
carousel.tsx — Horizontal carousel. Built on embla-carousel-react.
chart.tsx — Chart wrapper for recharts integration.
checkbox.tsx — Controlled checkbox. Built on @radix-ui/react-checkbox.
collapsible.tsx — Simple show/hide panel. Built on @radix-ui/react-collapsible.
command.tsx — Command palette with fuzzy search. Built on cmdk.
dialog.tsx — Modal dialog. Built on @radix-ui/react-dialog.
dropdown-menu.tsx — Context or trigger-anchored menu. Built on @radix-ui/react-dropdown-menu.
form.tsx — React Hook Form integration. Provides FormField, FormItem, FormLabel, FormControl, FormMessage components that wire useFormContext.
input.tsx — Text input with consistent styling.
label.tsx — Form label. Built on @radix-ui/react-label.
menubar.tsx — Horizontal menu bar. Built on @radix-ui/react-menubar.
popover.tsx — Floating popover anchored to a trigger. Built on @radix-ui/react-popover.
progress.tsx — Linear progress bar. Built on @radix-ui/react-progress.
radio-group.tsx — Radio button group. Built on @radix-ui/react-radio-group.
scroll-area.tsx — Custom scrollbar area. Built on @radix-ui/react-scroll-area.
select.tsx — Dropdown select. Built on @radix-ui/react-select.
separator.tsx — Horizontal or vertical divider.
sheet.tsx — Slide-in panel (drawer). Built on @radix-ui/react-dialog.
skeleton.tsx — Loading placeholder with shimmer animation.
slider.tsx — Range slider. Built on @radix-ui/react-slider.
switch.tsx — Toggle switch. Built on @radix-ui/react-switch.
table.tsx — HTML table with styled header, body, and cell components.
tabs.tsx — Tab navigation. Built on @radix-ui/react-tabs.
textarea.tsx — Multi-line text input.
toast.tsx / toaster.tsx — Toast notification system. Built on @radix-ui/react-toast. Global Toaster is mounted in root layout.
tooltip.tsx — Hover tooltip. Built on @radix-ui/react-tooltip.

## Key Composite Components

### CRM Data Grid
src/components/crm/shared/crm-data-grid.tsx — TanStack Table-based data grid. Props: data, columns, loading, onRowClick, mobileCard (render function for mobile card view), pagination controls, bulk action support.

### CRM Forms
src/components/crm/contacts/contact-form.tsx — React Hook Form + Zod schema for contact creation and editing.
src/components/crm/companies/company-form.tsx — Company form.
src/components/crm/deals/deal-form.tsx — Deal form with pipeline/stage selector.

### Activity Timeline
src/components/crm/activities/activity-timeline.tsx — Renders a list of ActivityItem components in chronological order. Supports types: note, task, call, meeting, email, message.

### Deal Kanban
src/components/crm/deals/deal-kanban.tsx — @dnd-kit sortable kanban board. Columns are pipeline stages (kanban-column.tsx), cards are deal-card.tsx. Drop updates deal stage via API call.

### Canvas Node Shell
src/components/nodes/node-shell.tsx — Base wrapper for all workflow nodes. Provides drag handle, 3px left accent border (category color), and control plane (run, duplicate, disable, lock, settings, delete buttons). Distinct from the ui-kit FlowNode block, which is a presentational automation/bot canvas node tile.

### Rich Text Editor
src/components/crm/notes/rich-text-editor.tsx — TipTap editor with toolbar. Stores content as JSON. Reads as plain text for search indexing via note-viewer.tsx.

### Rail
src/components/shell/rail.tsx — Primary left navigation rail (the former app-sidebar). 60px icon strip that hover-expands to a 248px floating overlay. Owns the module switcher and the user account cluster. AGENT SEE: docs/ui/layout-system.md for the full shell mount hierarchy.

### Agent Launcher
src/components/agent/agent-launcher.tsx — Floating button for starting agent missions.

AGENT UPDATE: Update this file when a shared component is added, removed, renamed, or its key props change.

## Related Docs

- docs/ui/theming.md — Styling system used by these components
- docs/ui/layout-system.md — Where components are composed
- docs/modules/crm.md — CRM-specific component details
