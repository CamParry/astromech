# 0029 — An unknown entries-list `where` key throws

**Date:** 2026-08-08
**Status:** accepted

`buildListWhere` now throws `UnknownWhereKeyError` on an unrecognised key instead of silently dropping it and returning every row (which had been showing unfiltered demo archives); rejected warning (server-rendered output, nobody reads the log) and waiting on field-value query indexing (the two demo callers moved to `where: { references }` first). Matches `entries/storage/table.ts`, which already threw.
