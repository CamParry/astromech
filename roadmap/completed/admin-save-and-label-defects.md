---
milestone: 1.0
---

# Admin save and label defects

Found on 2026-10-04 while planning `roadmap/planned/sidebar-groups.md` and
`roadmap/planned/admin-widgets.md`.

- **A plugin's translated label may show its key** (suspected, not confirmed).
  A plugin nav label given as a `$t` key may render the key instead of the
  text.
- **`Button` sets no `type`** (`packages/admin/src/components/ui/button.tsx`),
  so every `<Button>` is a submit button. Inside any `<form>`, such as a
  widget's own form, Enter in a text input clicks the first one (Strapi #22833
  deleted a repeatable item this way).
- **Save differs between edit screens.** The media detail modal has no
  Cmd/Ctrl+S (it uses plain `useForm`), and the user and admin-resource screens
  put Save in a sidebar "Actions" panel rather than the header.

The sidebar listing site entry types without a read check is already a fix in
`roadmap/planned/permissions.md`.

## The work

- [x] A test for the label, in the sidebar and the command palette; fix it if
      it fails. The defect was real: core turned a `{ $t }` label into its bare
      key. Labels now resolve against the plugin's bundle in the sidebar, the
      command palette and the plugin page header.
- [x] `Button` defaults to `type="button"`; submit buttons opt in. A raw
      `<button>` with no `type` is a lint error in core, admin and plugin
      sources.
- [x] Cmd/Ctrl+S in the media detail modal; Save in the header on the user and
      admin-resource screens; `aria-keyshortcuts` and a tooltip on every
      primary Save. Every primary save is labelled Save (`SaveButton`),
      Delete sits in the shared more-actions menu, and a form with no sidebar
      spans the full width. Cmd+S had never worked on a Mac.
