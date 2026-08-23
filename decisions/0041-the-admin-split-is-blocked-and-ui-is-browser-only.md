# 0041 — the admin package split waits on two prerequisites, and `astromech/ui` does not load under Node

**Date:** 2026-08-09
**Status:** accepted
**Supersedes:** 0007, in one claim only — everything else in that record stands

Splitting `admin/` into its own package is blocked, not rejected, behind two prerequisites (the config-free component kit and a gate that executes the admin), because the admin depends on consumer-side Vite compilation and virtual modules rather than importable subpaths, so it cannot ship built. Corrects 0007's claim that `astromech/ui` loads under plain Node: it imports `virtual:astromech/admin-config` and is browser-only.
