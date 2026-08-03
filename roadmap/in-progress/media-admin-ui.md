# Media Admin UI

Audit and rebuild of the media library admin surface — the `/admin/media` page, the media detail
modal, and the media-field picker — plus the serving and schema work those needed.

**Status:** in progress on `feat/media-admin-ui`. Branched from `main` and merged
`fix/admin-form-defects` (which was committed but not on `main` at the time; that merge resolved
two conflicts — see the branch's merge commit).

## What the audit found

Browser-verified against the demo on port 4323, plus a read of the media admin code.

- **Every upload 404'd.** The fetch client posted to `POST /api/media`; the router mounts the media
  routes at `/media` and registers the handler at `POST /upload`, so the only real endpoint is
  `/api/media/upload`. Affected the Upload button, the library drop zone and the media field alike.
- **`DropZone` ignored `accept` and `multiple`** — both declared, neither read.
- **Selection survived filtering.** Select all, then narrow the search, and the bulk bar still
  counted the hidden rows. A bulk delete would have removed files the user could not see.
- **Thumbnails loaded full-size originals** — 1200–1600px files into ~180px tiles, ~1.3 MB per page
  view where ~85 KB would do. The `/_media` variant pipeline already existed and worked
  (226 KB → 9.5 KB at `w=320`); the admin simply never used it.
- **`sort` was declared on `MediaQueryParams` and dropped** by the fetch client, the route and
  `storage.list` alike, so the list was always `createdAt DESC`.
- **The modal's Title field was decoration** — no column, no client signature, silently discarded.
- **One form instance served every media item**, so a touched form showed the previous item's alt
  text and could save it onto the next one.
- **`$id.tsx` is a second, unreachable edit screen** — un-i18n'd, duplicate `formatBytes`, nothing
  links to it but the command palette.
- Search fired one request and one history entry per keystroke.

Not a code defect, but it blocked testing: the demo database was missing migration
`0003_relationships-index`, so media delete 500'd with `no such column: source_kind`. Fixed by
running `npm run db:init`.

## Done

- [x] Upload posts to the route that exists; `DropZone` honours `accept`/`multiple`
- [x] Sorting wired end to end (client → route → `storage.list`) with an allowlist at both ends
- [x] Selection scoped to the active query, cleared during render so the stale count is never
      observable
- [x] Thumbnails on `/_media` variants; needed `mediaRoute` and the width allowlist in the admin
      config
- [x] Search debounced and history-replacing; total count on the pagination; page steps back when a
      bulk delete empties the last one; error states; i18n'd headers and filter labels
- [x] Real `title` and `caption` columns (migration `0004`), and the detail modal rebuilt —
      two-thirds preview with metadata beneath, one-third edit column, actions in a footer with
      delete separated from update

- [x] Shared `MediaBrowser` behind both the `/admin/media` page and the media-field picker, so the
      picker gets search, filtering, pagination, sorting and drag-drop upload

All of the above is merged to `main` and browser-verified against the demo: variant thumbnails
(`<source>` avif/webp on `/_media` at 320w/640w, `loading="lazy"`, and the browser picking the
variant over `/uploads`), sorting by filename and size, selection cleared when the filter narrows,
the rebuilt modal, and the picker as a full library.

One bug survived the whole gate and was only caught in the browser: `PUT /media/:id` destructured
`{ alt, title, fields }` and dropped `caption`, so the new field saved as `null`. The service-level
tests passed because they call the Local API and never touch the route — the same blind spot that
hid the upload 404. Fixed, with `tests/transport/http/routes/media-update-fields.test.ts` asserting
every editable column through the HTTP layer.

## Still open

- [ ] Resolve `$id.tsx` vs `MediaDetailModal` — delete the page and point the command palette at the
      modal, or delete the modal. Not both.
- [ ] `mediaApi.replace` exists with full variant cleanup but is exposed by no route, no client
      method and no UI
- [ ] Bulk delete is a sequential loop with no per-item catch: the first failure aborts the rest and
      the cache is never invalidated, so already-deleted files stay on screen
- [ ] `media:upload` gates metadata saves. Consistent with `permissions/index.ts` as designed, but
      worth revisiting — saving alt text is an update, not an upload.
- [ ] Admin components have no render-level test coverage; there is no `@testing-library/react` in
      the repo, which is why the drop-zone filter was tested through an extracted pure helper

## Notes for whoever picks this up

SQLite's `ADD COLUMN` can only append, so `title`/`caption` sit after `createdBy` in the media
descriptor rather than grouped with `alt`. The descriptor order has to match the migrated table or
`tests/db/baseline-ddl-parity.test.ts` fails — it caught exactly that on the first attempt. That
test is the gate for any further media schema change.

`db:generate` cannot be run from a worktree: `astromech` does not resolve there, so migration `0004`
was hand-authored and the snapshot hand-edited, with the parity test as the proof.
