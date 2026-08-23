# 0083 — Operations are named verb plus noun and take the record as one nested object

**Date:** 2026-08-21
**Status:** accepted

Operations in `entries/`, `users/` and `media/` are named verb+noun with plurality on the noun (`updateEntries`, `getUser`), and take addressing (`type`, `id`, `ids`) at the top level with the record under one `data` key. Exceptions `duplicateEntry({ overrides })` and `settings.set({ value })` keep meaningful words; service keys and the wire format are unchanged.
