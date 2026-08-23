# 0034 — Generated field types are aliases, and the gate boots a server

**Date:** 2026-08-09
**Status:** accepted

Codegen emits `export type` not `export interface` so generated field types get an implicit index signature and satisfy `Entry['fields']`; rejected a hand-added `[k: string]: unknown`, which reopens the type to typos. Blocks elements become `Array<JsonObject & {…}>`; `AstromechClient.plugins` loses its optional marker. Adds `apps/demo` to `typecheck` and a standalone `scripts/check-boot.mjs` asserting `/` 200, `/admin` 200, `/api/entries/post` 401 and exactly one config evaluation against a temp database.
