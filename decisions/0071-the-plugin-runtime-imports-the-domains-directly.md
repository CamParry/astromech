# 0071 — The plugin runtime imports the domains directly

**Date:** 2026-08-19
**Status:** accepted

The plugin runtime carried four dependency-inversion ports — `EntryAccess`,
`NotifyAccess`, `ClientAccess` and `PluginMethodsAccess` — each fed by an
injector module (`src/plugin-access.ts`, `src/entries/plugin-access.ts`,
`src/notifications/plugin-access.ts`) that the composition root called at
boot. All of it is deleted. `plugin-runtime.ts` now imports the domain
services, the entries storage registry, `qualifyEntryType`, `notify` and
`buildScopedTools` directly.

## Why

The ports existed to satisfy the no-upward layer rules, which
`decisions/0070-drop-dependency-cruiser.md` removed. Checked against the
actual imports, three of the four guarded no cycle at all. The fourth —
entries and the runtime referencing each other, because entry operations fire
hooks and hook dispatch builds a plugin context exposing entries — is a real
mutual reference, and it is tolerated rather than inverted: every
cross-reference resolves at call time, never during module evaluation, which
Node and every bundler in play handle.

Two properties make the direct imports safe:

- The service objects are stateless. Every driver, override and registration
  lives in `globalThis.__astromech`, so the config-time module graph and the
  SSR graph behave identically whichever copy a caller holds.
- The whole graph already loaded together: the root `astromech` barrel exports
  `createAstromech`, which statically imports the runtime and the services,
  and `check:node-imports` proves that barrel loads under plain Node on every
  gate run. The ports never separated the graphs — they only avoided a direct
  edge the scanner would have flagged.

## What it resolves beyond the deletion

The word "access" had two unrelated meanings in the package: permission
(`media.access`, the route guard `entryAccess()` in
`src/transport/http/routes/entries.ts`) and dependency-inversion wiring. The
wiring meaning is gone with the files, so "access" now means permission
everywhere, and the literal name collision between the two `entryAccess()`
functions is resolved by deletion.

## Rejected alternatives

- **Rename the ports off the word "access".** Treats the symptom. The
  structure that needed a name was the problem; with the layer rules gone it
  needed to not exist.
- **Split the runtime into a low hook dispatcher and a plugin host above the
  domains.** The right shape if a one-way import graph were still being
  enforced — it reduces four inversions to one. With nothing enforcing the
  direction, it trades one directory for two and keeps a seam whose only job
  was satisfying a rule that no longer exists.

`ctx` remains the only bridge a plugin's own code crosses
(`decisions/0007-plugin-core-boundary.md`), and `ctx.methods` keeps the shape
`decisions/0008-plugin-methods-port.md` settled — this record changes how the
runtime reaches the domains, not what a plugin receives.
