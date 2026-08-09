# Registry Consolidation

`ARCHITECTURE.md` says driver slots "share one mechanism
(`utilities/registry.ts`) over a single `globalThis.__astromech` namespace".
Thirteen slots do. Ten other globals do not: each declares its own top-level
`globalThis.__astromechX`, its own `declare global` block, and its own lazy-init
and reset helpers.

```
declare global blocks:            10 files
distinct global keys:             11 (__astromech + 10 siblings)
slots inside __astromech:         13
```

The comments show this was seen and copied rather than routed through the
abstraction. `entries/storage/registry.ts` says "State lives on globalThis
(mirrors the db/storage-driver registries)"; `plugins/runtime/entry-access.ts`
says "State lives on globalThis (like the other registries)". Files
reimplementing the thing they name is past the rule of three by a clear margin,
and the cost is not the duplicated lines — it is that the architecture doc is
false, and that the next author has two patterns to choose between with nothing
saying which.

## Why the abstraction does not currently fit

`createRegistry` models a **single-value slot**. Two of the hand-rolls are
**keyed maps**, which is why they were written by hand:

| File                                 | Shape                         |
| ------------------------------------ | ----------------------------- |
| `entries/storage/registry.ts`        | keyed by entry type           |
| `email/email-overrides.ts`           | keyed by override             |
| `plugins/runtime/entry-access.ts`    | single slot, resolve-or-throw |
| `request-context/request-context.ts` | single slot, lazy default     |
| `plugins/runtime/plugin-runtime.ts`  | record of several slots       |

The remaining globals are not registries at all and should not be forced into
one: `cron/runner.ts` (a tick lock and a warn-once set), `cron/drivers/interval.ts`
(an interval handle), `admin/support/ui-instance-guard.ts` (a duplicate-instance
guard), `transport/cli/virtual-config-shim.ts` (a CLI config stash). They share
the hazard that motivated the registry — a module-level singleton duplicates
across tsup entry chunks — without sharing its shape.

## Change

### 1. Add a keyed registry alongside the single-value one

- [ ] `createKeyedRegistry<T>(name)` in `utilities/registry.ts`, returning
      `{ set(key, value), get(key), peek(key), has(key), keys(), clear() }`,
      backed by a `Map` in the same `globalThis.__astromech[name]` slot.
- [ ] Keep it type-agnostic for the reason the file already states: a registry
      that names its value types turns the leaf into a hub.
- [ ] `clear()` resets the whole map. Every hand-rolled version has a
      `reset*Overrides()` that tests call, and they should converge on one name.

### 2. Convert the five registries

- [ ] `entries/storage/registry.ts` and `email/email-overrides.ts` →
      `createKeyedRegistry`.
- [ ] `plugins/runtime/entry-access.ts` → `createRegistry` with `required: true`.
      It is already resolve-or-throw, so this is a direct substitution.
- [ ] `request-context/request-context.ts` → `createRegistry`, with the lazy
      `new AsyncLocalStorage()` default kept at the single call site rather than
      inside the registry. Do this one last and carefully: it is the only one on
      the request hot path, and `request-context/request-context.ts` exists
      specifically to stay service-free for the plain-Node config load.
- [ ] `plugins/runtime/plugin-runtime.ts` holds a record of several things behind
      one key. Decide whether it becomes several slots or stays one; one slot is
      defensible if the parts are set together, and this file should say which
      it was.
- [ ] Each conversion keeps its existing public function names
      (`getEntryStorage`, `setEntryStorage`, …) so no call site changes.
      The registry is the implementation, not the surface.

### 3. Bring the non-registry globals into the namespace

- [ ] Move `__astromechCronInterval`, `__astromechCronTickRunning`,
      `__astromechCronUnscheduledWarned`, `__astromechUiInstance` and
      `__astromechCliConfig` inside `globalThis.__astromech` as plain keys, so
      there is one namespace to inspect and one to reset in tests.
- [ ] Delete the five `declare global` blocks that become unnecessary. The target
      is one `declare global` in `utilities/registry.ts`.
- [ ] Leave them as direct property access rather than registry objects — they
      are guards, not slots, and wrapping them would misdescribe them.

### 4. Make the doc true and keep it true

- [ ] Update the `ARCHITECTURE.md` invariant to say what the mechanism covers
      (driver and override slots) and what else lives in the namespace (process
      guards), since after step 3 both are true statements about one namespace.
- [ ] Add a dependency-cruiser or lint rule that a `declare global` outside
      `utilities/registry.ts` is an error. Without it this regrows — it grew to
      eleven with the invariant already written down.

## Notes / caveats

- **Behaviour-preserving throughout.** No public API change, no stored-data
  change, no migration. The full suite is the safety net and should need no
  edits; a test that needs editing is a signal the conversion changed something.
- **Test resets are the risk.** Several suites reset state between cases via the
  per-file helpers, notably `resetEntryStorageOverrides`.
  Converting the storage without converting the reset is how a suite starts
  leaking state across files, which shows up as order-dependent failures rather
  than clean ones. Convert each registry and its reset in the same commit.
- Steps 1 and 2 are one workstream. Step 3 is independent and smaller. Step 4's
  lint rule is what makes the other three durable and should not be dropped for
  time.
- This is small enough to land as a single branch, and it is a good candidate to
  do before `roadmap/planned/manifest-driven-transports.md` — it touches many
  files shallowly, so it conflicts badly with anything long-running.

`roadmap/completed/runtime-boot-and-live-config.md` raised the stakes on the
inventory. It moved boot out of `astro:config:setup` and into the first request,
so these slots are no longer filled once per build process but once per serving
process, and on Cloudflare once per isolate. Anything relying on
a slot already being populated at import time breaks there. The 17 slots
`initRuntime` fills are the ones to check; the lazy ones
(`cloudflareEnv`, `cloudflareProxy`, `__astromechRequestContext`) already have the
right shape and are worth reading as the model.

`roadmap/planned/drivers-and-registries.md` is the other half of the same
subject: this item is about how a slot is built, that one is about what goes in
it and how it is reached. They are independent, but doing this one first means
that one converts a single shape instead of two.
