# Entry Form Shows a Stale Value After Save

Observed 2026-08-02 while browser-verifying the validation work. **Not diagnosed, and
not attributed** — recorded here so the next person starts from the observation rather
than rediscovering it.

## What was seen

On `/admin/entries/caseStudy/<id>` in the demo (Astro dev server, real save):

1. Edited the `customer` field from `Lumenflow` to `Lumenflow International`, blurred,
   clicked **Update**.
2. Toast confirmed `Case Study updated.`
3. The input then displayed the **pre-edit** value `Lumenflow`, while
   `GET /api/entries/caseStudy/<id>?full=true` returned `"Lumenflow International"`.
4. Still stale several seconds later — this is not a mid-refetch flicker.
5. A full page reload showed the correct value.

So: **the write is correct and the data is never wrong.** Only the form's displayed
value goes backwards until the page is reloaded.

## What was NOT established

- **Whether it pre-dates the validation work.** The obvious control — repeat with a
  field carrying no warning rule — was spoiled: the value was set with a programmatic
  `form_input`, which never reached TanStack's form state, so **Update** saved the old
  value and the run proved nothing. Redo it with real typing.
- Whether the warning being present matters at all. It may well be irrelevant.
- Whether other entry types or the create page behave the same.

## Where to look

- `packages/astromech/src/admin/hooks/use-entry-form.ts` — both mutations do
  `form.reset(form.state.values)` in `onSuccess` before calling `onSuccess?.(entry)`.
  That should preserve what was typed, which is what makes the observation odd.
- Whatever query invalidation follows the save, and whether the entry page remounts
  with `defaultValues` from a cache entry that has not yet been refreshed.
- `entry-edit-page.tsx` — how `defaultValues` is derived and whether the form is keyed
  such that a refetch can remount it.

## Why it is not urgent

Data integrity is unaffected: the server holds the correct value and a reload shows it.
The risk is an author _believing_ their edit was lost and re-typing it — annoying, and
it would undermine trust in the save button, but it destroys nothing.
