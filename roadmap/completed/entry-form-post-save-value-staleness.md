# Entry Form Shows a Stale Value After Save

Observed 2026-08-02 while browser-verifying the validation work, diagnosed and
fixed 2026-08-06. The write was always correct; only the form's displayed value
went backwards until the page was reloaded.

## What was seen

On `/admin/entries/caseStudy/<id>` in the demo, against a real save: edit
`customer` from `Lumenflow` to `Lumenflow International`, click **Update**, get
`Case Study updated.`, and watch the input redisplay `Lumenflow` while
`GET /api/entries/caseStudy/<id>?full=true` returned the new value. Still stale
seconds later, so not a mid-refetch flicker. A reload showed it correctly.

## The mechanism

Nothing invalidated the query cache after a save.

`useEntryForm`'s save and publish mutations call `form.reset(form.state.values)`
in `onSuccess`. `FormApi.reset` installs those values as `options.defaultValues`
**and** resets every field's meta, so form-level `isTouched` returns to `false`.
`@tanstack/react-form`'s `useForm` runs `formApi.update(opts)` in a layout effect
**with no dependency array**, and `update` copies `defaultValues` into
`state.values` whenever they deep-differ from the previous options **and**
`!isTouched`. `EntryEditPage` rebuilt `defaultValues` as a fresh object literal
from `entry` on every render, and `entry` came from a cache entry nothing had
invalidated.

So `reset` re-opened the gate that `isTouched` had held shut during typing, and
the stale cached entry was copied back over the just-saved values. It only bit
after a save for exactly that reason: while typing, `isTouched` is `true` and the
copy is blocked.

The orphan that made it possible: `useUpdateEntry` did this invalidation
correctly and had **zero consumers**. It was left behind when the edit page was
refactored onto `useEntryForm` plus a raw `saveFn`. Two things that both claim to
own the save, one of them unused, is how the invalidation went missing without
anyone noticing.

## What confirmed it

A double-save in the browser, which discriminates this from every per-field
mechanism. Save one value, watch it revert; save a **different** value, and it
reverts to the **original** again rather than the previous save — because the
cache still holds what the page loaded with. A direct API read confirmed the
latest write had landed.

## As built

`EntryEditPage`'s `onSuccess` now takes the saved entry, resolves keys through
`scopedEntryKeys(cacheScope)`, calls `setQueryData(keys.get(type, id), updated)`
and then `invalidateQueries({ queryKey: keys.all(type) })`.

- **`setQueryData` before the invalidate**, so the render immediately after
  `form.reset` already sees fresh `defaultValues` and the clobber never happens.
  Invalidate-only lets it happen and then corrects it, which shows as a flicker.
- **The invalidate stays** because the update route returns `asEntry(updated)`
  straight from storage, which is not the same read path as the `GET ?full=true`
  the detail query uses and may lack locale enrichment.
- **`scopedEntryKeys`, not bare `queryKeys.entries`** — a plugin-mounted entry
  type would otherwise write to the wrong cache entry.
- `keys.all(type)` is a prefix of `keys.get(type, id)`, so one invalidate covers
  both.
- `useUpdateEntry` was deleted. It was unreachable from any `package.json` export
  path, so removing it was not a public API change.

`entry-new-page.tsx` is the only other `useEntryForm` consumer and is unaffected:
it navigates away on success, so there is no re-render to clobber and no prior
cache entry to go stale.

## The test, and why the first one didn't count

`tests/admin/components/entries/entry-edit-cache-invalidation.test.tsx` mounts
the real `EntryEditPage` behind a memory router and the provider stack. The first
attempt instead recreated the page's hook composition inside the test file,
including its own copy of `onSuccess` — which passed whether or not the page was
fixed, and so could not have caught the very regression it was written for. The
bug was itself caused by wiring going missing in a refactor, which is precisely
the failure a self-contained test cannot see.

The acceptance check that settled it: revert the change in `entry-edit-page.tsx`
alone, leave the test file untouched, and the test must fail. It does, with
`expected 'Lumenflow' to be 'Lumenflow International'` — the live symptom.

This is the first test in the suite to mount a full admin page; use it as the
pattern when the subject is page-level wiring.
