---
name: ui
description: Admin UI guidelines for Astromech. Use when building or editing React components, pages, or hooks. For CSS authoring rules, also load the css skill.
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
- **Never read `form.state` during render.** It is a getter, not reactive state, so a control derived from it (`disabled={!form.state.isDirty}`) renders once and never updates — a Save button that stays dead with a dirty form, and no error anywhere. Subscribe instead: `useStore(form.store, (s) => s.isDirty)`.
- **Seed `useState` from a prop once, behind a guard.** A field component that rebuilds its value from the prop on every render fights TanStack Form's `defaultValues` layout-effect copy, and the loser is whichever wrote second. `use-blocks-field.ts` and `use-tree-field.ts` carry the guard to copy.

## Accessibility

- Icon-only buttons need `aria-label`. Use semantic HTML (`button`, `nav`, `main`) not `div` soup.
- Add `aria-busy="true"` on containers during async operations.

## Localization

All user-facing strings via i18next — no hardcoded English.
