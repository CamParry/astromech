# 0074 — Files leave the layer-word buckets for their subject, and a leaf may sit above its caller

**Date:** 2026-08-19
**Status:** accepted

Dissolved the layer-word buckets (`admin/lib/`, `admin/support/`, `entries/utils/`), moving files to their subject; `utilities/` survives only for true miscellany. A pure leaf (constant, type, or function over its arguments, importing only leaves) may be imported from any layer; everything else points down. `*.shared.ts` applied only where the admin bundle actually reaches.
