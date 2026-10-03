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

- [ ] A TanStack Router blocker in `useFieldsForm` that asks before leaving a
      dirty form.
- [ ] The same for the media detail form.
- [ ] Tests: leaving a dirty form asks; a clean one does not.
