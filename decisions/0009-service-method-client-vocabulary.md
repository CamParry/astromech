# 0009 — One noun per role: service, method, client, API

**Date:** 2026-08-04
**Status:** accepted

## Context

One concept answered to four words depending on which layer you looked at.
`entries.publish` was implemented in `entries/service.ts`, typed `EntriesApi`,
described by a `ServiceMethodDescriptor` in `entries/descriptors.ts`, catalogued
as a `ManifestMethod`, exposed at `astromech/methods`, permission-scoped by a
`ScopedService`, and assembled into an `AstromechClient`.

Counts in `src/` at the time: `service` 185, `api`/`API` 134, `methods` 89.

Three type files — `types/api.ts` (404 lines), `types/client.ts` (316),
`types/services.ts` (178) — were three views of the same operations, and none of
their names said which view.

Two concrete collisions:

- **"API" already meant the HTTP API.** `transport/local/index.ts` used it both
  ways inside a single docstring: "Astromech Local API […] the HTTP API is the
  enforcement boundary."
- **The six domains disagreed with each other.** Four export patterns across six
  domains: `entries`, `mediaApi`, `usersApi`, `settingsApi`, `contentApi`,
  `notificationsRepo`. The last was a rule violation rather than drift —
  `decisions/0003` refused the repository layer and the `code` skill says "never
  `XRepository`". The word came back abbreviated.

This had been revised at least three times without sticking.

## Why the earlier attempts failed

Each pass picked a better _word_ rather than deciding what the word _names_.
There isn't one concept here needing a name. There are four, and each answered to
two or three of {service, API, method, client}. Renaming within that ambiguity
just moved which layer was wrong.

## Decision

**One noun per role, never reused.**

| Role                                                     | Word        | Reads as                                                           |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| A domain's callable operations, and their implementation | **service** | `entriesService: EntriesService`, in `entries/service.ts`          |
| One operation on a service                               | **method**  | `ServiceMethodDescriptor`, `ManifestMethod`, `<domain>/methods.ts` |
| The assembled object a consumer holds                    | **client**  | `AstromechClient`, `astromech/local`, `astromech/fetch`            |
| The HTTP surface                                         | **API**     | "the HTTP API", `transport/http/`, `AstromechApiError`             |

Three of the four were already right. **`method` was fully consistent across
descriptor, manifest, subpath, generator and CLI command** — that consistency is
the evidence the model works, and it is what the rest now copies. The only word
doing double duty was `Api`, in the one place the ecosystem has already claimed.

What shipped:

- `*Api` types → `*Service` (`EntriesApi` → `EntriesService` and five siblings,
  plus `TypedEntriesApi`/`TypedEntriesApiFor`)
- one export pattern across all six domains: `<domain>Service`
- `types/api.ts` → `types/services.ts` (the operations); `types/services.ts` →
  `types/methods.ts` (describing operations); `types/domain.ts` and
  `types/client.ts` unchanged
- `<domain>/descriptors.ts` → `<domain>/methods.ts`, which also frees the bare
  word "descriptor" to mean table-or-field

## What was deliberately not renamed

- **`AstromechApiError`** — thrown by the fetch client on an HTTP failure, so
  under this scheme it is genuinely an API error.
- **`fields/descriptors.ts`** — the field-type registry, a different thing from
  service-method descriptors.
- **The `<domain>Descriptors` consts** — qualified by domain, so unambiguous.
  They follow whenever `ServiceMethodDescriptor` itself is renamed.
- **Manifest method ids and the `entries.*` wire names** — `entries.publish` is
  a protocol string, not a binding. One mechanical pass rewrote
  `` `entries.${key}` `` to `` `entriesService.${key}` `` in
  `policies/scoped-services.ts`; it was reverted. That string is the method id
  in `PermissionDeniedError` and no test would have caught it.

## Rejected

**Reviving "SDK".** Already correctly gone — `ARCHITECTURE.md` records `sdk/` as
dissolved in the 2026-06 refactor. "SDK" means a published package a third party
installs, which is what `astromech` itself is, so it cannot also name a layer
inside it.

**Bare domain exports (`media`, `users`).** `mediaService` sidesteps the
collision with the `Media` type that `mediaApi` was presumably invented to dodge
in the first place. Verbose but unambiguous, and it matches the filename.

**`ScopedApis` for the permission-scoped container.** A since-deleted spec
proposed it, reasoning from the fields all being `*Api`. That was correct only
under the vocabulary this decision replaces; the container is `ScopedServices`.

## Consequences

- `astromech/methods`, `astromech/db/schema` and the root export all changed
  shape. Pre-1.0 with no external consumers, so cheap now and expensive later —
  which is the whole reason for doing it at this point.
- `tests/policies/methods-export.test.ts` asserts the `astromech/methods` export
  list by name and is the tripwire for anything that drops a re-export.
- The word "surface" survives in the `excluded by surface policy` reason strings
  emitted by `astromech methods --json`, because changing those is a behaviour
  change rather than a rename. See `roadmap/in-progress/naming-pass.md`.
