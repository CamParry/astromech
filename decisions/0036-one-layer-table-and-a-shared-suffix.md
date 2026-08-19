# 0036 — One layer table, and a suffix instead of an allowlist

**Date:** 2026-08-09
**Status:** superseded by 0070

`packages/astromech/.dependency-cruiser.cjs` held eleven rules that each
hand-enumerated every sibling directory. It had already failed open:
`notifications/` is a domain and appeared in zero of them, so it could import
`boot/`, `transport/` and `admin/` with nothing to stop it, and
`plugins/runtime/plugin-runtime.ts` was calling `notify()` on it in plain sight.
The header comment listed `cli` as a top-layer directory; there is no `src/cli/`,
the CLI is `transport/cli/`.

The layer model is now written once, as `LAYERS`, and the no-upward rules are
generated from it. Adding a directory to `src/` is one word in one array, and
`directory-must-be-in-a-layer` fails the scan until somebody adds it.

## The bespoke rules take their sets from the table too

Four rules carry an exemption the table cannot express, and stay hand-written:
`database-no-upward-except-aggregate` (`database/schema.ts` is the table
aggregator), `leaves-are-pure` (two type-only carve-outs),
`transport-server-no-reach-client-or-admin`, and `no-circular`. Their
directories still live in `LAYERS` — a `HAND_WRITTEN_NO_UPWARD` set removes them
from the generated `from` — so `directory-must-be-in-a-layer` still accounts for
them, and each takes its layer sets by slicing `LAYERS` rather than restating
them. Nothing outside the table enumerates a sibling directory.

The alternative was to fold the exemptions into the generator as per-directory
options. That buys a table that no longer reads as a table: four of its
twenty-five entries would carry a regex, and the reader would have to run the
generator in their head to know what any rule forbids.

## Widening the rules to the whole tree found three real edges

Generating from the full table rather than five partial lists surfaced upward
edges that had never been named. They are on `NO_UPWARD_EXEMPT` with their
reason, rather than dropped from the table:

- `transport/cli/` reaches `boot/` and `codegen/`. It is a standalone entrypoint
  that resolves its own config and boots itself; the replaced
  `transport-no-reach-boot` already exempted it.
- `transport/tools/` and `transport/mcp/` read the generated method manifest from
  `codegen/`. `roadmap/planned/manifest-driven-transports.md` moves it.
- `plugins/runtime/plugin-runtime.ts` calls `notify()` on the notifications
  domain. This is the same shape as the entries edge that
  `plugins/runtime/entry-access.ts` turned into a port, and it wants the same
  treatment.

Naming an exemption is not the same as blessing it, but it is the difference
between a guardrail with three known holes and one whose holes nobody can list.

## `*.shared.ts` replaces the admin allowlist

`admin-only-client-and-pure-leaves` carried five paths in a `pathNot`:
`entries/type-ids`, `entries/utils/url`, `entries/validation-stage`,
`settings/page-values`, `media/serving/image/url`. Each is a pure function the
browser needs from a domain, and each addition was a config edit.

They keep their homes and take a `.shared.ts` suffix, and the `pathNot` collapses
to `\.shared\.(ts|tsx)$`. Payload is the prior art for identifying browser-safe
code by where it lives rather than by a list (`src/exports/shared.ts` plus the
`browser` export condition); the suffix is the same idea without a second
directory to keep in sync with the first.

The saving in config lines is not the point. The constraint is now in the
filename, so the mistake this class of rule exists to catch is legible in a diff
without running the scan.

`shared-files-stay-browser-safe` keeps the marker honest: a `*.shared.ts` file
may import only what the admin itself may import. Without it the suffix is a way
to launder a server module into the client bundle — and since
`roadmap/completed/runtime-boot-and-live-config.md`, `virtual:astromech/config`
re-exports the author's config rather than a JSON literal, so anything reaching a
domain service pulls every driver and plugin the config names in behind it.

"What the admin itself may import" rather than "pure leaves" is deliberate, and
is the set the roadmap's wording would have got wrong: it includes `fields/`,
because `settings/page-values.shared.ts` reads `fields/flatten` and the admin
already imports `fields/` in eleven places. Stating the rule as the admin's own
allowance also makes it true by construction that the marker can never widen the
browser's reach.

## Two blocks: layer rules, environment rules

The rules that have caught real defects are not layering rules. They are
environment rules — admin code runs in a browser, the fetch Client talks over the
wire, a plugin package loads in plain Node, the integration loads at config time.
`policies-no-upward` and `transport-no-reach-boot` have no such record.

The file now reads as two labelled blocks, and the environment block names its
two siblings that are not dependency rules at all, `npm run check:config` and
`npm run check:node-imports`, with a line saying what each covers. Three checks
enforcing one idea in three mechanisms should not read as three unrelated
one-offs.

## dependency-cruiser can exclude a type-only edge

Asked by `roadmap/planned/domain-owned-service-contracts.md` step 0, which that
answer un-blocks. With `tsPreCompilationDeps: true` — already set — an
`import type` edge is reported with `type-only` in its `dependencyTypes`, and
`dependencyTypesNot: ['type-only']` inside a rule's `to` clears it while still
failing a value import of the same module from the same file. Measured, not
inferred. The key is not valid at the top level of a rule; the config fails
schema validation there.

So a domain contract the admin imports as a type needs neither a rename nor a
carve-out. The caveat is scope: `dependencyTypesNot` opens the exemption for the
whole rule, where the `*.shared.ts` marker is scoped to the file carrying it.

## What was verified

Twelve deliberate violations, one per rule the change replaced or added, each
applied to the working tree on its own, confirmed rejected by name, and reverted:
a domain importing `policies/`, `storage/` and `plugins/runtime/entry-access.ts`
each importing `entries/methods`, `policies/` importing `admin/`,
`transport/http/index.ts` importing `boot/boot` and importing the fetch Client,
`database/types.ts` importing a domain, `utilities/bytes.ts` importing
`media/service`, an admin file and a `*.shared.ts` file each importing
`settings/service`, the fetch Client importing `entries/methods`, and a new
`src/analytics/` directory absent from `LAYERS`. A generated rule set that has
never rejected anything is not evidence that it can.
