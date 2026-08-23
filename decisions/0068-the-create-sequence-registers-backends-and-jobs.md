# 0068 — The create sequence registers backends and built-in jobs

**Date:** 2026-08-19
**Status:** superseded by 0069

`registerDrivers` becomes `registerBackends` (it also fills the db instance and image/AI config slots), and built-in cron jobs register through one composition-root `registerBuiltInJobs()` aggregator over per-domain job arrays. Rejected `registerCapabilities`, per-backend installers, a call per domain in `build`, and import-time self-registration (`sideEffects: false` tree-shakes it). Superseded by 0069.
