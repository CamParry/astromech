# 0068 — The create sequence registers backends and built-in jobs

**Date:** 2026-08-19
**Status:** superseded by 0069

Two naming/structure choices in the create sequence (`build` in
`src/astromech.ts`, its steps in `src/registrations.ts`).

## `registerDrivers` becomes `registerBackends`

The function fills every registry slot the domains read from the authored
config: the database handle and driver, the storage driver, the image config,
the email driver, the AI config and the scheduler driver. "Drivers" named only
part of that — it registers the database instance and two config blobs (image,
AI) that are not drivers — so the name undersold what the reader would find
inside. `registerBackends` covers all of it: these are the pluggable backends
the config supplies.

Rejected:

- **`registerCapabilities`.** "Capability" is already the narrower term for a
  config-declared _optional_ feature slot (decision 0032, `media.image`). The
  database and storage are required, not optional, so the word would fit some of
  the set and not the rest.
- **Split into per-concern installers** (`registerDatabase`, `registerStorage`,
  …). That multiplies the top-level calls in `build` — one per backend — which
  runs against the other goal of this pass: a `build` that reads as a short list
  of phases. One aggregator that fills the slots is the right grain; the domains
  already own the individual `setX` calls it makes.

## Built-in cron jobs register through one aggregator

`build` used to call `registerBuiltInEntryJobs()` — the entries domain's own
step. Every further domain that shipped a built-in job would have added another
call to `build`. Instead each domain exports its jobs as an array (`entryJobs`),
and a single composition-root `registerBuiltInJobs()` registers them all. `build`
calls it once; a new domain's jobs are added where the arrays are gathered, not
in `build`.

Rejected:

- **A call per domain in `build`.** `build` grows with every domain that adds a
  job — the thing the aggregator exists to prevent.
- **Fully automatic self-registration** (each job module registers itself on
  import). The package is `sideEffects: false`, so an import kept only for its
  registration side-effect is tree-shaken out of the build — the same constraint
  that makes `plugin-access.ts` an explicit `setPluginAccess()` call rather than
  an import side-effect. The aggregator is the explicit-call equivalent: domains
  contribute a data array, the composition root does the registering.
