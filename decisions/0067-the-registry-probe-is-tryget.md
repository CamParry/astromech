# 0067 — The registry probe is `tryGet`, not `peek`

**Date:** 2026-08-19
**Status:** accepted

`createRegistry` and `createKeyedRegistry` expose two reads: `get`, which
throws when the slot is unset, and the probe that returns `T | null` for callers
that legitimately expect an empty slot. The probe was named `peek`. It is now
`tryGet`.

## Why rename

`peek` describes a stack operation (look at the top without popping). A registry
slot is not a stack, and nothing is consumed by reading it, so the metaphor
carried no information here. `tryGet` says exactly what the method does: attempt
the read, get the value or `null`. It reads as the pair of `get` it is, and it
matches the `TryGetValue` convention a reader coming from C#/.NET already knows.

## Why not the alternatives

- **`get` returns `T | null`, throwing read becomes `require`/`getOrThrow`**
  (the Map-semantics option first floated in discussion). Rejected on two counts.
  The throwing read is the dominant one — every domain reads its own driver
  expecting it to be present (135 call sites against 14 probes) — so it is the
  read that should keep the short name, not the rare probe. And flipping `get`
  from throwing to null-returning changes the meaning of a name used in 135
  places; a single missed site would swap a loud throw for a silent `null`.
  Keeping `get` throwing and renaming only the 14-site probe is both safer and
  better-ergonomics.
- **`find`.** The ecosystem "maybe returns" verb (`Array.find`), but it implies
  searching a collection. A single-slot registry has nothing to search, so
  `find()` reads oddly there; `tryGet()` reads correctly for both the single-slot
  and the keyed registry.

## Also aligned

The database driver registry is the one slot exporting both reads: a required
`getDatabaseDriver` (throws — `auth.ts` needs a dialect) and a probe that was
`peekDatabaseDriver`. The probe becomes `tryGetDatabaseDriver`, so the exported
pair mirrors the registry's own `get`/`tryGet` and the `peek` verb is gone from
the surface. The optional-capability reads (`getAIConfig`, `getSchedulerDriver`,
`getImageConfig`, `getEmailDriver`) are left as they are: each is a lone probe
with no throwing sibling to disambiguate from, so `getX` reads fine there.
