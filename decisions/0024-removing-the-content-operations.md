# 0024 — Removing the content operations

**Date:** 2026-08-06
**Status:** accepted

Deleted `src/content/` (the `translate`/`transform`/`generate` methods, the never-implemented `ContentProvider` port, their routes, permissions and types) because the operations were discoverable as tools yet failed at runtime, and their shape depends on an undesigned UI. When they return they must own the read/selection/placement/write and land staged for review; the permission question leans toward folding into the target's `update`, and removal dissolved the layer model's one cross-domain import exception.
