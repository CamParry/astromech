# 0062 — The application is the in-process surface; the fetch client is typed by the wire

**Date:** 2026-08-17
**Status:** accepted

Delete `AstromechClient`, `transport/local/` and the `astromech/local` subpath; the application instance is the in-process surface and `astromechClient` is a standalone REST wrapper typed by the wire, with parity kept by a test rather than a shared type. Plugin ports move from module-scope import side effects to an explicit `wirePluginAccess()` injecting a six-handle slice, not the instance.
