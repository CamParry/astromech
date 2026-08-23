# 0015 — A public subpath mirrors its source directory

**Date:** 2026-08-04
**Status:** accepted

A public subpath names its source directory (`astromech/db/*` → `astromech/database/*`, `astromech/images/*` → `astromech/media/image/*`), with `astromech/ui` the one exception since "ui" is what plugin authors type. Fetch's named export became `astromechClient` while local keeps `Astromech`, because local is the one users actually type.
