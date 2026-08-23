# 0089 — `createdBy` is who made the row, not who wrote the content

**Date:** 2026-08-24
**Status:** accepted

`entry_versions.createdBy` means the acting user whose write created the row (`getCurrentUser()?.id`, null outside a request), not the author of the snapshotted content, pairing with `createdAt` and matching `entry_preview_tokens`. Adds a live FK to `users`, so test harnesses injecting an identity must seed the user row.
