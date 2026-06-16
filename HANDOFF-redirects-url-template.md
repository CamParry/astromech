# Handoff — redirects slug-change hook: failing test (missing `url` template in test harness)

**Owner:** whoever is working the `url`-template + redirects-restructure effort (parallel session).
**Status:** 1 failing test. **Not** caused by the content-visibility feature (Steps 1–6) — surfaced during its recovery/verification.
**Branch:** `phase-18a-plugin-runtime`.

---

## Symptom

```
FAIL src/plugins/redirects/redirects.test.ts > redirects — slug-change hook
     > records a redirect when a root entry slug changes
AssertionError: expected [] to have a length of 1 but got +0
  src/plugins/redirects/redirects.test.ts:140
```

Repro:

```
npx vitest run src/plugins/redirects/redirects.test.ts -t "records a redirect"
```

(The full suite is otherwise green: **517 / 518 passing**, `tsc` clean.)

## Root cause

The slug-change hook only records a redirect when the entry type has a `url` template:

`src/plugins/redirects/hooks/slug-change.ts:17`

```ts
const template = ctx.config.entries[event.type]?.url;
if (!template) return; // ← bails here for `post`
```

The test mutates a `post` entry's slug (`hello` → `goodbye`) and expects a redirect row. But the **shared test harness** `post` type defines **no `url` template**:

`src/test/harness.ts:89` (`makeTestConfig().entries.post`) — has `single`, `plural`, `versioning`, `translatable`, `fields` (`body`, `category`, `related`) but **no `url`**.

So `template` is `undefined`, the hook returns early, and no redirect is created → `redirectRows()` is `[]`.

## Why it is NOT the content-visibility work

- The hook receives `event.entry` from `entrySnapshot()` → `storage.get()` (raw, **unfiltered**) — drafts are not visibility-filtered here (`src/sdk/local/entries.ts:463`, `:790-804`).
- Redirect creation is a **write** (`ctx.entries.create`), and writes are never shape-filtered.
- The failure reproduces independently of the visibility changes; it is a test-config gap in the `url`-template feature.

## Suggested fix (pick one)

- **(Recommended) Give the redirects test its own config** with a `url`-templated type instead of relying on `makeTestConfig`. Avoids shared-harness side effects.
- **Or** add a `url` template to the harness `post` type, e.g. `url: '/{slug}'`. ⚠️ Verify this doesn't change **menus** test expectations: `src/plugins/menus/sdk/menus.ts` `resolveEntryRef` iterates `ctx.config.entries` and resolves URLs for every type where `config.url` is set — adding `url` to the shared `post` could make menu entry-refs resolve where they previously didn't. The menus suite currently passes (16/16); re-run it after any harness change:
    ```
    npx vitest run src/plugins/menus/tests/menus.test.ts
    ```

## Related context

- The `url`-template feature (`config.url`, `resolveEntryUrl`/`resolveEntryPath` in `src/core/entry-url.js`) and the redirects plugin restructure (`redirects/{hooks,entries,sdk}/…`) were in-progress in a parallel session and were recovered intact from the `recovery/2310` snapshot after an accidental tree wipe.
- Content-visibility feature (Steps 1–6) is complete and green; see `specs/content-visibility.md`.
