# 0071 — The plugin runtime imports the domains directly

**Date:** 2026-08-19
**Status:** accepted

Deleted the four dependency-inversion ports (`EntryAccess`, `NotifyAccess`, `ClientAccess`, `PluginMethodsAccess`) and their injector modules; `plugin-runtime.ts` imports domain services directly, tolerating the entries/runtime mutual reference since it resolves at call time. Rejected renaming the ports off "access" and splitting the runtime into dispatcher + host. "Access" now means permission only.
