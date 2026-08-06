# Peek design system

## Direction

Peek is a restrained operations console: pure neutral surfaces, compact information density, exact alignment, and interaction behavior that feels predictable before it is used. The interface should disappear into monitoring work. Visual intensity is reserved for conditions requiring action.

## Color

Use opaque OKLCH tokens. Moss is the rare brand accent and must remain below roughly 8% of the visible surface.

- Background: `oklch(1 0 0)`
- Foreground / carbon: `oklch(0.145 0 0)`
- Surface: `oklch(0.975 0.003 250)`
- Muted foreground: `oklch(0.455 0.012 250)`
- Border: `oklch(0.91 0.006 250)`
- Moss primary: `oklch(0.58 0.12 140)`
- Moss soft: `oklch(0.955 0.025 140)`
- Warning: `oklch(0.70 0.16 70)`
- Critical: `oklch(0.64 0.17 25)`

Status always pairs color with an icon and label. Charts are monochrome by default; semantic colors appear only at threshold crossings.

## Typography

Use Poppins everywhere, including telemetry. Weight creates hierarchy; no secondary or monospace typeface is allowed. Product sizing is fixed, compact, and based on a 1.125–1.2 ratio. Headings balance; prose wraps prettily. Dynamic numbers use tabular numerals.

## Layout

Use a 4px spacing base. Desktop uses a compact persistent sidebar and a 12-column workspace. Related evidence groups tightly at 8–12px; major regions separate at 32–48px. Cards are reserved for independently actionable regions; use whitespace and structural dividers elsewhere. Mobile collapses navigation into a shadcn Sheet and converts wide evidence/table regions into prioritized summaries.

## Components

Use only local shadcn/ui primitives and compositions for interactive UI. Keep controls 40px minimum on dense desktop surfaces and 44px under coarse pointers. Corners stay between 8px and 12px, except pills used for true tags or status. Prefer borders for structure and subtle shadows only for overlays.

Key compositions:

- App shell: persistent Sidebar on desktop, Sheet on narrow viewports, and intent-preloaded TanStack routes.
- Selection: searchable shadcn Command + Popover compositions for clients and projects; selection updates immediately while the shared shell remains mounted.
- Attention: Alert with severity icon, explanation, and one action.
- Provider evidence: semantic sections using Badge, Separator, Tooltip, and Button.
- Signals: shadcn Chart with a single selected metric and textual summary.
- Checks: shadcn Table on desktop; compact list on mobile.
- Loading: Skeleton preserving final geometry.
- Empty/error: Alert plus direct next action; never an empty decorative card.

## Motion

Use 150–200ms interruptible transitions for color, opacity, and transform. Refreshes are optimistic: retain the last successful snapshot, update freshness immediately, and show inline progress without blocking the page. Press feedback uses `scale(0.96)`. Respect `prefers-reduced-motion`; no orchestrated page-load animation.

## Signature

The Peek mark is a pair of square brackets framing one moss dot: `[ • ]`. It appears in the wordmark, active navigation, and favicon-scale identity only. It is not repeated as decoration.
