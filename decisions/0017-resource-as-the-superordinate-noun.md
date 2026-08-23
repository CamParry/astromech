# 0017 — `resource` as the superordinate noun

**Date:** 2026-08-04
**Status:** accepted

`resource` names the four field-bearing things (entry, user, media, settings page); `ResourceType` gains `'setting'` and the document validators become resource validators (`resourceValidate`, `ResourceValidator`). Rejected `record` (too database-flavoured, already refused for entries) and `document` (collides with ProseMirror docs); `TargetKind` survives as the relation-eligible subset.
