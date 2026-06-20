# Forward versioning (staged entries)

- [ ] Prepare/preview/merge a future version of a live entry without touching it — closes the "edit live" gap that backward versioning (`completed/versioning-publishing-scheduling.md`) left open
- [x] **WS1** — Schema + capability: `stagedFor` FK + index, partial slug unique index (`WHERE staged_for IS NULL`), list/uniqueSlug exclusion, `entry_preview_tokens` table, `staging` capability (default off, independent of versioning, built-in only) + config types; migration 0014
- [x] **WS2** — Staging service: `createStaged`/`getStaged`/`mergeStaged`/`deleteStaged` on the entries service (+ `EntriesStagingApi` type, `StagedEntryExistsError`, storage `staging.getByCanonical` sub-surface). Staged entry = separate linked row; createStaged copies content + relations (fresh localeGroup); merge = backup(if versioning)→update(id/slug preserved, publishes)→hard-delete staged, in a transaction
- [x] **WS0** — Status enum `draft`→`unpublished` (drop the draft/working-copy overload), incl. data migration + UI/i18n + `TERMINOLOGY.md`. Shipped alone.
- [ ] Merge = backup→update→cleanup with canonical id stable
- [x] **WS3** — Preview: `issuePreviewToken`/`revokePreviewToken` (hashed, optional TTL, one per entry) + `previewToken`/`staged` params on `get`/`query`; token-authorized reads bypass the publish/schedule gate (visibility `preview` mode — public shape, trashed still excluded); invalid/absent token → empty → 404. Front-end URL wiring (`?preview=`/`?staged=`) is WS4
- [ ] Service + transport + SDK: `createStaged`/`getStaged`/`mergeStaged`/`deleteStaged` + preview-token issue/verify
- [ ] Admin: own-URL staged editor, Current|Staged toggle = navigation, rename UI "revisions"→"versions"
- Design-locked spec + WS0-6 plan: `specs/forward-versioning.md` (terminology → `TERMINOLOGY.md` at ship). `staging` capability independent of versioning, built-in storage only. Entries-only v1; scheduled merge + table-backed + settings/menus staging deferred
- Substrate for the AI confirm-gate (`planned/ai-integration.md`): AI stages a change, human reviews + merges; entries only
