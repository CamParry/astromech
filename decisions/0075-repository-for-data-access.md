# 0075 — `repository` for the data-access layer, `storage` for files

**Date:** 2026-08-20
**Status:** accepted
**Supersedes:** 0003 (the "no repository wrapper" naming point only)

`storage` means file storage only; the DB access layer renamed `createStorage`/`Storage` → `createRepository`/`Repository`, `EntryStorage` → `EntryRepository`, `EntryRecord` → `EntryRow`, with no new layer or narrowed query grammar. Supersedes 0003's no-repository rule. Rejected `store`, `persistence`, and renaming the file side to `blob/`.
