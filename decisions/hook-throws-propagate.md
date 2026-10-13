---
area: structure
---

# A hook's throw always propagates

There is one hook runner, `runHook` (`packages/astromech/src/hooks/hooks.ts`), with no try/catch for any event, and the plugin runtime subscribes to it like any other caller. A return other than `undefined` replaces the payload. An after-hook's throw reaches the caller although the write it followed stays committed. [Hooks](../roadmap/planned/hooks.md) plans to log an after-hook's throw instead.

**Rejected:** failure rules chosen by event name (`:before` hooks throw, `after*` throws are logged).
