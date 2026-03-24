---
name: ui
description: Admin UI guidelines for Astromech. Use when building or editing React components, pages, hooks, or styles in the admin panel.
user-invocable: false
---

## Components
- Check `@/admin/components/ui/` before building. Import from `@/components/ui/index.js` only.
- Extend and spread native element props: `type FooProps = React.ComponentProps<'div'> & { ... }`, then `<div {...props}>`.
- Class names: `['am-block', mod ? 'am-block--mod' : '', className].filter(Boolean).join(' ')`

## Logic
- Handler functions use `handle` prefix: `handleSave`, `handleDelete`.
- Extract to a hook when logic is reused, complex, or mixes concerns. Simple `useState` stays inline.
- Conditional rendering: `&&` for optional, ternary for if/else, early return for guards.

## Accessibility
- Icon-only buttons need `aria-label`. Use semantic HTML (`button`, `nav`, `main`) not `div` soup.
- Add `aria-busy="true"` on containers during async operations.

## Localization
All user-facing strings via i18next — no hardcoded English.
