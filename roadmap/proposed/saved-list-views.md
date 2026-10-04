---
milestone: later
---

# Saved list views

An entry list's filters, sort and columns
(`packages/admin/src/components/entries/entries-list-toolbar.tsx`) reset when
the editor leaves. Raised on 2026-10-03.

## Prior art

- **Payload Query Presets** (3.31, March 2025): saved filters, columns and sort,
  shared with chosen users or roles.
- **Directus bookmarks**, and its request for dynamic values in presets (173
  votes).

## Open questions

- Is remembering the last state per user (browser storage) enough for 1.0?
- Who can share a view, and with whom?
