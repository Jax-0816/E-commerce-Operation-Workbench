---
name: Ecommerce AI Workbench
description: A compact, evidence-first operations command ledger for Chinese ecommerce work.
colors:
  ink-950: '#151e28'
  ink-900: '#1c2734'
  ink-800: '#293746'
  ink-650: '#56616c'
  ink-500: '#606971'
  paper: '#f6f3ed'
  paper-warm: '#fbfaf6'
  surface: '#fffdf9'
  line: '#dcd8cf'
  line-strong: '#c8c2b7'
  primary: '#b92b2a'
  primary-dark: '#941e20'
  primary-soft: '#f7e9e6'
  success: '#1f8044'
  warning: '#875407'
  warning-soft: '#fbf1dc'
  focus: '#d54a3e'
typography:
  display:
    fontFamily: 'Noto Sans SC Variable, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: 'clamp(27px, 2.3vw, 34px)'
    fontWeight: 760
    lineHeight: 1.2
    letterSpacing: '-0.025em'
  title:
    fontFamily: 'Noto Sans SC Variable, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '17px'
    fontWeight: 720
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Noto Sans SC Variable, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'Noto Sans SC Variable, PingFang SC, Microsoft YaHei, sans-serif'
    fontSize: '11px'
    fontWeight: 650
    letterSpacing: '0.08em'
rounded:
  xs: '4px'
  sm: '6px'
  md: '9px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface}'
    typography: '{typography.body}'
    rounded: '{rounded.sm}'
    padding: '8px 14px'
    height: '38px'
  button-primary-hover:
    backgroundColor: '{colors.primary-dark}'
    textColor: '{colors.surface}'
    rounded: '{rounded.sm}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink-800}'
    typography: '{typography.body}'
    rounded: '{rounded.sm}'
    padding: '8px 14px'
    height: '38px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink-950}'
    typography: '{typography.body}'
    rounded: '{rounded.xs}'
    padding: '9px 10px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink-800}'
    rounded: '{rounded.md}'
    padding: '20px'
---

# Design System: Ecommerce AI Workbench

## Overview

**Creative North Star: "Operations Command Ledger"**

The workbench feels like a disciplined operations ledger: deep ink navigation establishes a stable command frame, warm paper surfaces hold dense working information, and cinnabar marks the few actions that advance the workflow. The interface is intentionally professional, direct, and restrained; hierarchy comes from grouping, typography, dividers, and state language rather than decorative effects.

Evidence is part of the visual system. Current, pending, locked, warning, and unavailable states must be explicit in words and structure, never inferred from color alone. Dashboard shortcuts remain neutral whenever facts, SKUs, or platform profiles were not queried, and future capabilities carry their real phase label instead of fabricated progress.

**Key Characteristics:**

- Desktop-first, information-dense Operate mode with a persistent command frame.
- Warm paper and deep ink surfaces, with sparse cinnabar action emphasis.
- Low-radius geometry, fine dividers, semantic tables, and no decorative gradients.
- Honest state language, keyboard-visible focus, and resilient narrow-screen stacking.

## Colors

The palette pairs quiet warm neutrals with deep blue-black ink; cinnabar drives action, jade confirms real availability, and dark amber communicates caution with sufficient contrast.

### Primary

- **Command Cinnabar** (`primary`): primary buttons, active navigation, links that advance work, and compact count accents.
- **Pressed Cinnabar** (`primary-dark`): hover and selected text treatment; it must not become a second decorative accent.
- **Cinnabar Wash** (`primary-soft`): restrained hover feedback on large choices.

### Secondary

- **Verified Jade** (`success`): confirmed or currently available states only.
- **Operational Amber** (`warning`): caution, locked scope, and attention text; the approved accessible value is `#875407`.

### Neutral

- **Command Ink** (`ink-950`): sidebar ground and highest-emphasis text.
- **Ledger Ink** (`ink-900`, `ink-800`): headings and primary working copy.
- **Secondary Ink** (`ink-650`, `ink-500`): supporting copy and metadata; the approved low-emphasis token is `#606971`.
- **Warm Paper** (`paper`, `paper-warm`): application canvas and sticky operating chrome.
- **Porcelain Surface** (`surface`): cards, tables, fields, and navigation strips.
- **Ledger Lines** (`line`, `line-strong`): structural dividers and control boundaries.

**The Sparse Cinnabar Rule.** Reserve the primary color for active location, important action, and concise workflow emphasis; never wash whole dashboards in it.

**The Evidence Color Rule.** Green means a state is actually known. Unknown or unread data uses neutral ink and explanatory copy, never green, amber, or an inferred progress state.

## Typography

**Display Font:** Noto Sans SC Variable (with PingFang SC, Microsoft YaHei, sans-serif fallback)
**Body Font:** Noto Sans SC Variable (with PingFang SC, Microsoft YaHei, sans-serif fallback)

**Character:** A single Chinese sans-serif family keeps dense operational content calm and legible. Weight, size, and spacing create hierarchy without a display typeface or oversized marketing treatment.

### Hierarchy

- **Display** (760, responsive 27–34px, 1.2): route and workspace titles.
- **Title** (720, 17px): panel and ledger section headings.
- **Body** (400, 14px, 1.55): instructions and working content, with explanatory paragraphs limited to about 68 characters where the layout permits.
- **Label** (650, 11px, 0.08em): navigation groups, metadata, table headers, and compact status context.

**The Operations Scale Rule.** Headings orient; they do not advertise. Keep titles compact enough that tables and next actions remain visible in the first viewport.

## Layout

The desktop shell uses a fixed 224px command sidebar and a flexible work surface. A sticky operating-context bar sits above optional horizontal product navigation; the content canvas is capped at 1540px and uses 28px desktop insets. The dashboard leads with a four-stage readiness rail, then a primary ledger beside a 272px attention column.

At 1180px the sidebar compresses to an 80px icon rail and secondary context fields recede. At 860px navigation becomes a compact horizontal strip, the attention column stacks below the ledger, and readiness becomes two columns. At 620px context and headings stack, primary calls to action become full width, readiness becomes one column, and content insets reduce to 12px. Wide semantic tables remain horizontally scrollable rather than clipping or collapsing their meaning; the exact 390 × 844 mobile capture is the narrow-screen acceptance reference.

**The Ledger-First Rule.** Give the largest uninterrupted area to the user’s real records and next action; supporting scope and shortcuts stay secondary.

## Elevation & Depth

The system is flat by default and uses no decorative shadows or gradients. Depth comes from the dark command rail, tonal surface changes, sticky chrome, one-pixel dividers, and restrained borders. The only shadow-like treatment is the functional focus halo on fields and keyboard focus; it communicates interaction state, not physical elevation.

**The Structural Depth Rule.** Use borders and tonal adjacency to separate working regions. Do not add floating cards, ambient drop shadows, glass effects, or gradient depth.

## Shapes

Corners are compact and functional: fields and notices use the extra-small 4px radius, buttons and navigation items use 6px, and major panels use 9px. Circular geometry is reserved for step numbers, status dots, and small count badges. Tables rely on straight dividers inside a softly rounded outer container.

**The Low-Radius Rule.** Rounded corners soften the ledger without making it playful; never turn primary work surfaces into pills.

## Components

### Buttons

- **Shape:** compact rounded rectangle (6px) with a minimum 38px height and 8px × 14px padding.
- **Primary:** Command Cinnabar with warm-white text and strong weight; hover moves to Pressed Cinnabar.
- **Secondary:** Porcelain Surface with a strong ledger-line border and Ledger Ink text.
- **Text action:** borderless cinnabar text with an arrow for in-table progression.
- **Focus / Disabled:** keyboard focus uses the dedicated focus halo; disabled actions use neutral grey fill, explicit phase copy, and a not-allowed cursor.

### Cards / Containers

- **Corner Style:** restrained major-panel radius (9px).
- **Background:** Porcelain Surface over Warm Paper.
- **Shadow Strategy:** none; use one-pixel Ledger Lines and tonal changes.
- **Internal Padding:** normally 18–20px; dense table cells use 13–14px.

### Inputs / Fields

- **Style:** warm-white field, strong neutral border, compact 4px corners, and full-width behavior.
- **Focus:** primary border plus a subtle three-pixel cinnabar halo.
- **Error / Disabled:** error content uses a pale red surface and explicit alert text; disabled controls remain legible and visibly unavailable.

### Navigation

Global navigation groups live on Command Ink with muted labels, light icons, and a solid cinnabar active row. Product navigation is a horizontally scrollable porcelain strip with a two-pixel cinnabar underline for hover and active states. On narrow screens, labels are visually hidden in the compact icon strip while accessible names remain intact.

### Readiness Rail

The four-step rail uses numbered circles, concise labels, and secondary detail text. A verified current step may use jade; locked work uses a lock icon and neutral tonal fill. The note below the rail states exactly what the dashboard did and did not read.

### Task Ledger

The task ledger is a semantic table with a muted header band, fine row dividers, concise two-line cells, and horizontal overflow on small screens. Product facts come from the local API; unqueried fact, SKU, and platform-profile state is described neutrally.

## Do's and Don'ts

### Do:

- **Do** keep the most important product record, data reliability, and next action scannable within seconds.
- **Do** use semantic landmarks, tables, controls, alert/status roles, accessible names, and visible keyboard focus.
- **Do** label unavailable capability with its real phase and keep unread dashboard data neutral.
- **Do** preserve every core action at narrow widths through stacking and horizontal overflow.
- **Do** use Phosphor icons with a consistent stroke language.

### Don't:

- **Don't** fabricate metrics, completion percentages, regulatory feeds, or SKU/profile readiness that the current API did not return.
- **Don't** use gradients, decorative shadows, glass surfaces, oversized marketing type, or stacked generic statistic cards.
- **Don't** use color as the only status signal or let low-emphasis text fall below the approved `ink-500` and `warning` contrast corrections.
- **Don't** replace semantic controls with clickable containers, handwritten SVGs, emoji, or CSS illustrations.
