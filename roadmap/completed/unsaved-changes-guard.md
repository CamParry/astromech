# Unsaved changes are lost silently

Found on 2026-10-03 while planning `roadmap/planned/autosave.md`.

- `useFieldsForm` (`packages/admin/src/hooks/use-fields-form.ts`) guards only
  `beforeunload`. There is no in-app navigation guard (no `useBlocker` or
  `shouldBlockFn`), so a sidebar link, the locale switcher or "Stage change"
  discards edits without asking.
- The media detail form
  (`packages/admin/src/components/media/media-detail-modal.tsx`) has its own
  form with no guard at all.

The class: any form whose edits can be dropped by navigation the form does not
see.

## The work

- [x] A TanStack Router blocker in `useFieldsForm` that asks before leaving a
      dirty form.
- [x] The same for the media detail form.
- [x] Tests: leaving a dirty form asks; a clean one does not.
- [x] Writes that drop the form ask first: merge, log out (a `/logout`
      route), adding a locale, duplicating, and closing the upload dialog.
- [x] An edit typed while a save is in flight keeps the form dirty.
