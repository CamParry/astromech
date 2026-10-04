# Autosave

The editor form saves only when the editor clicks Save; a closed tab or an
expired session loses the work. Raised on 2026-10-03; decided the same day.
**Target: 1.0.** Builds on `roadmap/planned/drafts.md` and
`roadmap/planned/editor-locking.md`.

## What exists

- `useFieldsForm` (`packages/admin/src/hooks/use-fields-form.ts`) has Cmd+S
  and the unsaved-changes guard
  (`packages/admin/src/hooks/use-unsaved-changes-guard.ts`), which asks before
  a tab close or an in-app navigation drops a dirty form.
- A save of an unpublished entry skips `required` (the `partial` validation
  mode) but runs every other rule, so a half-typed email address is refused.

## Prior art

- **Payload:** autosave writes only the draft; the live document is never
  touched; validation is skipped on drafts and runs on publish.
- **Craft** debounces about 1 second; **Ghost** saves 3 seconds after the last
  edit and every 60 seconds during continuous typing; **EmDash** 2 seconds.
- **Kirby 5** and **Statamic** autosave into the one pending copy, guarded by a
  lock (Kirby). **WordPress** autosave checks the post lock.
- No system autosaves into live content.

## Decided (2026-10-03)

- **Autosave writes the draft** (or the row of an unpublished entry), never
  live content. It applies to entries and globals with statuses.
- **Users, media and types without statuses do not autosave**, since their
  saves go live. They keep a copy of unsaved changes in browser storage for
  crash recovery, and the navigation guard.
- **Timing:** 2 seconds after the last edit, and every 30 seconds during
  continuous typing. A pending autosave is sent when the editor leaves, with
  `fetch` and `keepalive`.
- **Autosave writes no history** (`roadmap/planned/history.md`).
- **Validation:** autosave checks types only, so half-typed values are kept and
  shown as errors in the form; an explicit save of an unpublished entry keeps
  today's partial checks; publish checks everything.
- **Hooks run on autosave**, and the event carries `autosave: true` so a plugin
  can ignore it.
- **The edit lock:** an autosave from someone who does not hold the lock gets
  the lock's 409; the form turns read-only and keeps the unsaved values so they
  can be copied. Autosave does not renew the lock.
- **On by default**, with `autosave: false` per entry type and global.

## The work

- [ ] The type-only validation mode for autosave.
- [ ] The admin: debounce, the 30-second save, the flush on leave, saving
      state in the header, the lock-lost state.
- [ ] `autosave: true` on hook events; `autosave: false` in config.
- [ ] Browser-storage recovery for forms without drafts.

## Testing

Typing then pausing saves the draft and leaves the live read unchanged; a
half-typed email is stored in the draft and refused on publish; a lost lock
stops autosave without losing the form's values; leaving the page sends the
pending save.
