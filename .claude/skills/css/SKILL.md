---
name: css
description: CSS authoring rules for Astromech admin styles. Use when writing or editing any CSS file in src/admin/styles/.
user-invocable: false
---

## Tokens

- Any value used across 2+ components gets a CSS custom property named `--am-<component>-<property>`, using the full CSS property name (`background-color` not `background`, `border-radius` not `radius`).
- All sizing values must be multiples of `0.25rem`. No arbitrary values like `2.2rem`.
- Prefer theme-aware color tokens (e.g. `var(--am-color-border)`) over raw `rgba()` — theme tokens adapt to dark mode automatically.
- Never use `opacity` to lighten or tint a color — use a full color token or `color-mix(in srgb, ...)` instead. `opacity` affects the entire element including text and children, and produces different results across backgrounds.
- Use existing scale tokens (`--am-duration-fast`, `--am-easing`, `--am-radius-md` etc.) before reaching for hardcoded values.

## Box model

- Use `border` not `outline` for decorative edges — `box-sizing: border-box` is applied globally so border never expands layout.
- Inner radius of items nested inside a padded container: `calc(var(--am-popup-border-radius) - var(--am-popup-padding))` — keeps corners visually concentric.

## Focus

- Do not override `outline-offset` on individual components — the global `:focus-visible` rule in base.css is sufficient.

## Hover & interaction states

- Always wrap `:hover` in `@media (hover: hover)` to prevent stuck hover states on touch devices.
- Do not wrap `[data-highlighted]` or other JS-managed data attributes in `@media (hover: hover)` — they are set and removed by the component library and do not produce stuck states.
