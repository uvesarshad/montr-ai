# Theming

> Scope: Design token system, CSS custom properties, dark mode, and Tailwind configuration.
> Rendering context: Client-side (dark mode class toggle)
> Project tier: 4
> Last updated: 2026-06-04

## Overview

MontrAI uses Tailwind CSS 3 with shadcn/ui-style CSS custom properties (HSL values on :root and .dark). Dark mode is class-based, toggled by next-themes (ThemeProvider). The palette is cool violet-tinted neutrals: --primary is near-black and is the default action color, while violet is the --brand accent only. Default Buttons render near-black; violet CTAs use the brand variant. Surfaces are opaque (no glass-morphism / backdrop-blur).

## Design Tokens

Defined in src/app/globals.css as CSS custom properties under :root (light) and .dark.

### Light Mode Key Values

- --background: 270 22% 99% (near-white, violet-tinted page background)
- --foreground: 270 12% 16% (near-black text)
- --card: 0 0% 100% (white)
- --primary: 270 8% 12% — near-black; the default action color. Tailwind primary maps to hsl(var(--primary)), not a frozen hex.
- --primary-foreground: 0 0% 100%
- --accent: 270 18% 95% (cool light neutral)
- --muted: 270 16% 96%
- --muted-foreground: 270 6% 46%
- --destructive: 2 78% 58% (red)
- --border: 270 16% 91%
- --input: 270 16% 89%
- --ring: 252 91% 66% (focus ring — the violet brand hue)
- --radius: 0.625rem (all rounded corners)

### Brand Accent Tokens

- --brand: 252 91% 66% — violet #7a5af8, the single accent color
- --brand-strong: 252 64% 57%
- --brand-foreground: 0 0% 100%
- --brand-muted: 255 80% 96%

Violet is an accent only: default Buttons are near-black (--primary); violet CTAs use the brand variant (--brand).

### Pastel KPI Surface Tokens

Very light tinted surfaces for KPI tiles, each with a matching tinted border (--pastel-bd-*):

- --pastel-violet: 258 60% 97% / --pastel-bd-violet: 258 36% 89%
- --pastel-mint: 158 48% 95% / --pastel-bd-mint: 158 30% 85%
- --pastel-blue: 212 70% 96% / --pastel-bd-blue: 212 42% 88%
- --pastel-peach: 28 80% 96% / --pastel-bd-peach: 28 52% 87%
- --pastel-rose: 2 70% 97% / --pastel-bd-rose: 2 42% 89%
- --pastel-lemon: 48 86% 95% / --pastel-bd-lemon: 48 56% 84%

Exposed in Tailwind as pastel.violet/mint/blue/peach/rose/lemon and pastel.bd-* colors. The ui-kit KpiTile takes a pastel prop (violet/mint/blue/peach/rose/lemon).

### App-Specific Tokens (opaque surfaces)

- --app-bg: #f1eff7
- --app-surface: #ffffff — primary card surface (opaque, no transparency)
- --app-surface-strong: #ffffff
- --app-sidebar-bg: #ffffff
- --app-header-bg: #ffffff
- --app-border: #e7e3f0 — subtle borders
- --app-shadow: 0 1px 2px rgba(20, 16, 32, 0.04)
- --app-text-muted: #74717c
- --app-text-faint: #94909c

### Dark Mode

.dark class overrides the same properties with a cool-charcoal set (not navy, not pure black): --background 270 12% 14%, --card 270 11% 17%. --primary inverts to near-white (0 0% 98%) over a near-black --primary-foreground, so default buttons read as light-on-dark; --brand brightens to 252 95% 72%. App surfaces become opaque charcoal: --app-bg #1a1820, --app-surface #28262e, --app-border #3e3b48. The pastel KPI surfaces and their borders have dark-mode variants in the same token names.

ThemeProvider (next-themes) adds/removes the .dark class on the html element based on user preference or system setting.

## Tailwind Configuration

File: tailwind.config.ts. darkMode: ['class'] enables the class-based strategy.

Shadcn-compatible tokens (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring) are mapped from CSS custom properties using hsl(var(--token)) syntax. The primary token maps to hsl(var(--primary)) (near-black) — there is no longer a frozen purple hex.

Additional token-backed color families in extend.colors: brand (DEFAULT/strong/foreground/muted), the semantic tones success/warning/danger/info (each DEFAULT/foreground/muted), and pastel (violet/mint/blue/peach/rose/lemon plus bd-* border variants). A few legacy fixed hex tokens remain (primary-focus #67E8F9, brand-bg/brand-surface/brand-border/text-main/text-muted Slate values).

Chart colors: --chart-1 through --chart-5 for recharts integration. Token-backed box shadows: shadow-btn / shadow-card / shadow-card-hover map to --shadow-* (top sheen + cool soft layers).

Fonts: Inter for sans/body/headline (var(--font-inter)) and JetBrains Mono for mono/code (var(--font-jetbrains-mono)), loaded via next/font/google in the root layout.

## Component Styling Pattern

All UI components use the cn() utility (src/lib/utils.ts) which merges Tailwind class names with tailwind-merge and clsx. Class variance authority (class-variance-authority) is used for component variant definitions in src/components/ui/.

AGENT NOTE: Do not hardcode color hex values in component files. Use Tailwind token classes (bg-primary, text-muted-foreground, etc.) or CSS custom property references so dark mode works automatically.

## Canvas Node Category Colors

Canvas node shells use a category-based accent color system. Six categories: input, ai, logic, action, output, utility. Colors are defined in src/components/nodes/node-categories.ts (CATEGORY_THEME). Each node renders a 3px left border and handle with the category accent color.

AGENT UPDATE: Update this file when design tokens are added or renamed, when the dark mode strategy changes, or when the Tailwind config color system changes.

## Related Docs

- docs/ui/component-library.md — Shared UI primitives
- docs/ui/layout-system.md — Where global styles are mounted
