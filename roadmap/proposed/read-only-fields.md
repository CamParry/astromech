---
milestone: 1.0
---

# Read-only fields

A field whose value is stored and shown but cannot be edited in the admin: an
imported id, a value a hook or plugin computes, a date set by a workflow.
Raised on 2026-10-04 while planning `roadmap/planned/admin-widgets.md`, where
"read-only" was kept free for this meaning.

## Prior art

- **Payload:** `admin.readOnly` on a field, admin-side only; access control
  (`access.update`) decides whether the API may write it.
- **Filament:** `readOnly()` on a field; `disabled()` with `dehydrated(false)`
  also keeps it out of the saved data.
- **Directus:** a field's "Readonly" option in the data model.
- **HTML:** `readonly` shows and submits the value but blocks editing.

## Proposal

- `admin: { readOnly: true }` on a field: rendered, focusable and copyable, not
  editable, and left out of what the admin sends.
- A conditional form taking the declarative `condition` shape from
  `roadmap/planned/conditional-fields.md` (read-only when the condition holds).

## Open questions

- Admin only, or does the API refuse writes too (a field-level write rule)?
  Payload separates the two.
- Does a read-only field still go through validation on save?
- Should hooks and the CLI be able to write it, and `fields:rename` move it?
