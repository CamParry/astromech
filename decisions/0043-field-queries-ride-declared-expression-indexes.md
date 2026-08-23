# 0043 — Field-value queries ride declared expression indexes, not columns and not a lookup table

**Date:** 2026-08-10
**Status:** accepted

If filtering entries by field data ships, it uses per-field declared expression indexes over `json_extract(fields, '$.path')`, with index DDL and query SQL emitted from one declaration; undeclared field filters keep throwing. Rejected generated columns on the shared `entries` table (no precedent; killed Craft 2-4), a typed EAV lookup table, and silent unindexed JSON scans.
