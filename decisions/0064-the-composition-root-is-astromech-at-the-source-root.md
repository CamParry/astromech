# 0064 — The composition root is `astromech.ts` at the source root

**Date:** 2026-08-18
**Status:** accepted

The application factory moves out of `boot/` to a root-level
`packages/astromech/src/astromech.ts`, and `boot/` dissolves. The file is named
for the object it builds, the boot sequence is inlined into `createAstromech`,
the "phase" vocabulary is dropped, and migration orchestration moves to
`database/`. This refines [0057](0057-one-application-instance-thin-framework-integrations.md)
and [0063](0063-what-the-application-reorganization-changed.md), which put the
factory in `boot/` alongside the rest of the composition root.

## `astromech` over `application`

The file was `boot/application.ts` while the type it exports is `Astromech` and
its functions are `createAstromech` / `getAstromech`. That is a drift: the file
says one word, the object says another. It is settled on `astromech`, so the
file, the type, the factory and the registry key all say the same thing.

The counter-argument for `application` was that it is generic and survives a
package rename. It loses because the public API (`Astromech`, `createAstromech`,
`getAstromech`) already carries the brand, so a rename touches all of those
anyway and the file name is the least of it. The generic word still has a job:
"application" stays the common noun for the running instance in prose and in the
`TERMINOLOGY.md` entry, "Astromech" the proper noun. That is a noun pair for one
thing, not the file/object drift.

The prior art is brand-forward. Payload's `getPayload`, `BasePayload` and
`Payload` type all live in `packages/payload/src/index.ts`; Strapi's `Strapi`
class and `createStrapi` factory sit together at its `src/` root. Naming the
file for the object is the norm, not an Astromech invention.

## Root-level, not a `boot/` directory

Every comparable framework puts the core application factory at the package
`src/` root, not in a verb-named subdirectory: Payload (`src/index.ts`), Directus
(`api/src/app.ts`, `server.ts`), Medusa (`medusa-app.ts`), Strapi (`Strapi.ts` +
`index.ts`). Where a directory appears it names a layer — Laravel's `Foundation/`
— never a verb, and Laravel's `bootstrap/app.php` is the consumer's call site,
not where the class lives. `boot/` as the home of the factory was the outlier.

`astromech.ts` is the primary entry point for the whole package, so it belongs
where a reader looks first. `registrations.ts` (the register steps) and
`plugin-access.ts` (the plugin ports) are the wiring it calls; they move to the
root beside it as the rest of the composition root. `migrations.ts` is not
composition at all — it is database migration orchestration (it operates on the
db handle and the migration providers), so it moves to `database/migrations.ts`,
its honest home. `boot/` then holds nothing and is removed.

## The layer model bends to the code, not the reverse

`.dependency-cruiser.cjs` modelled the composition root as a `boot/` directory
because its layer table is a list of top-level directories. A rule that forces
the primary entry point into a subdirectory to satisfy the tool is the tool
shaping the code. The rule is relaxed instead: the composition root is now
matched as the root-level files (`astromech.ts`, `registrations.ts`,
`plugin-access.ts`), and both guarantees it carried as a directory survive — no
layer below the entrypoints tier may import the composition root, and no browser
bundle may hold it (importing it drags `virtual:astromech/config` and the whole
driver graph into the client). Root-level files already escaped the
`directory-must-be-in-a-layer` rule, so no new hole opens.

## The boot sequence is inlined; "phase" is dropped

`boot/lifecycle.ts` ran the steps through a `runBootPhases` orchestrator with a
`BootPhase` union type and per-step `phase()` timing. That was a vocabulary for
what is just an ordered list of calls. `createAstromech`'s private `build` now
lists the steps directly — resolve config, register drivers, register jobs,
check migrations, register plugin runtime, boot plugins — and the timing is a
generic `utilities/timing.ts` `stopwatch()` the sequence uses, so measuring a
step is separated from knowing the steps. "Phase" leaves the vocabulary; "boot
plugins" stays only because it names the plugin runtime's established
register/boot pair (0057), not a phase of the application.

`register drivers` used to also register the built-in jobs and run the migration
drift check, which made the name lie. Those are now their own steps in the
sequence, visible where they run, and `registerDrivers` genuinely only registers
drivers. There is no umbrella step hiding work.

## The `entriesService` cast

`entriesService as unknown as TypedEntriesService` appeared verbatim at both
composition sites. `TypedEntriesService` layers compile-time literal-type
overloads over the wide runtime `EntriesService`, so the cast is a genuine
runtime-erasure boundary, not a missing type — it cannot be "typed away." It is
centralised instead: `entries/index.ts` exports one documented `typedEntriesService`,
and the two sites read it. The fetch client's cast
(`transport/http/client/index.ts`) and the scoped-plugin cast
(`plugins/runtime/plugin-runtime.ts`) are separate erasures over different source
objects in other layers, and are left where they are.

## Rejected

- **Keeping `boot/`.** Accurate as a verb but out of step with every peer, and
  it forced the primary entry point one level down from where a reader looks.
- **Reworking the layer model to allow root files as a first-class tier.** Not
  needed: root files already escape the directory rule, and the two protections
  transfer with a matcher. A larger rework would be change for its own sake.
- **Fully inlining `registrations.ts` into `astromech.ts`.** Payload does keep
  everything in one file, but the register steps pull ~15 domain imports, and
  putting them beside the public `Astromech` type buries the front door in
  wiring. The sequence reads in `astromech.ts`; the wiring it calls lives next
  door.
- **"Typing away" the `entriesService` cast.** The narrowings are compile-time
  only; there is no runtime type to assign. Centralising the acknowledged
  erasure is the honest fix.
