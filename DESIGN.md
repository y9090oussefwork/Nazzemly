# Nazzemly public design language

## Purpose

The public website must make digital-subscription merchants feel that their work can become more orderly before they enter the product. The visual voice is calm, capable, Arabic-first B2B SaaS.

## Foundation

- Theme: dark evergreen, used consistently from landing through authentication.
- Accent: emerald for the primary action, meaningful status, and small moments of focus.
- Base surfaces: `#07110e`, `#0b1612`, `#0c2119`.
- Text: white for headings, zinc for supporting copy, emerald-tinted copy only on emerald surfaces.
- Radius: 8px for buttons and compact controls, 12px for panels and inputs, 16px for large page containers.
- Depth: one soft, low-contrast shadow for elevated shells. Borders define ordinary grouping.

## Type

- Arabic: Noto Sans Arabic, with strong weights for headings and labels.
- Latin and tabular numerals: Geist.
- Headings are compact and direct. Body copy uses a relaxed line height and a narrow reading measure.

## Public components

- `SiteBrand`: the consistent product mark and wordmark.
- `SiteHeader`: responsive primary navigation with a small mobile menu.
- `AuthShell`: shared login and registration shell with a concise product narrative and a clear form area.

## Interaction

- Use purposeful transitions only for hover, press, open state, and focus.
- Every interactive control has a visible emerald focus treatment.
- Buttons move down by one pixel on press rather than using decorative scaling.
- Reduced-motion users receive nearly static transitions.

## Responsive rules

- Desktop landing uses an asymmetric editorial split for the first viewport.
- Mobile collapses to a simple single column with the primary action visible before the illustrative panel.
- Auth screens stack their narrative and form areas, keeping inputs full-width and labels persistent.

## Guardrails

- Do not add purple accents, decorative gradients, generic glass panels, or equal icon-card grids.
- Do not use huge rounded containers or repeated floating badges.
- Keep dashboard surfaces outside this public design scope until a dedicated dashboard phase is approved.
