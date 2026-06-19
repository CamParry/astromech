# Forward versioning (staged entries)

- [ ] Prepare/preview/merge a future version of a live entry without touching it — closes the "edit live" gap that backward versioning (`completed/versioning-publishing-scheduling.md`) left open
- [ ] Staged entry = separate linked entry (`stagedFor` FK, partial unique index, excluded from lists); reuses all entry machinery + own history
- [ ] Status enum `draft`→`unpublished` (drop the draft/working-copy overload); merge = backup→update→cleanup with canonical id stable
- [ ] Preview via existing published slug route — token authorizes + `?staged=1`/`?version=` selector (no preview route, no id-in-URL)
- [ ] Service + transport + SDK: `createStaged`/`getStaged`/`mergeStaged`/`deleteStaged` + preview-token issue/verify
- [ ] Admin: own-URL staged editor, Current|Staged toggle = navigation, rename UI "revisions"→"versions"
- Design-locked spec + WS0-6 plan: `specs/forward-versioning.md` (terminology → `TERMINOLOGY.md` at ship). `staging` capability independent of versioning, built-in storage only. Entries-only v1; scheduled merge + table-backed + settings/menus staging deferred
- Substrate for the AI confirm-gate (`planned/ai-integration.md`): AI stages a change, human reviews + merges; entries only
