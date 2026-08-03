# Naming pass

**Status:** designed 2026-08-04, not started. Supersedes and absorbs
`specs/policies-naming.md` (2026-08-03), which is deleted.

Three reviews, merged: a deep pass over `packages/astromech/src/policies/`
(2026-08-03), a high-level pass over the core's module names, public exports and
concept vocabulary (2026-08-04), and a deep pass over
`packages/astromech/src/entries/` (2026-08-04, §F and §G). They are one branch
because §A renames a type that §B renames a container of, and doing them apart
means resolving the same conflict twice.

## The rules this was run against

`CLAUDE.md` (global + project): established web-ecosystem vocabulary, no words
already taken in-domain, no quality/vibe names, no coinage without a
`TERMINOLOGY.md` entry.

**The global banned-word list changed on 2026-08-04**, prompted by this pass. It
was one undifferentiated list; it is now two, split by failure mode:

- **Never** — names a quality, not a thing: _ambient, awareness, insight, smart,
  unified, holistic, seamless, intelligent, fabric_.
- **Stop and justify** — real words already taken: _bus, context, adapter,
  middleware, store, provider, hook, signal, reducer, engine, pipeline, kernel,
  orchestrator, gateway, broker, manager_. Allowed when the thing genuinely is
  that thing and you can name the prior art in one sentence.

Why: the old list banned `engine` and `pipeline`, which this codebase uses
correctly and heavily (`@astromech/schema-engine` is a published package name;
`fields/pipeline.ts` is a real coerce → default → validate pipeline, 55
identifiers across 29 files). A rule you must override to do the right thing
trains you to stop reading it. Meanwhile `bus`, the word that caused the rule,
has zero real uses in the repo (all seven file matches are "business").

Consequence for §C1 below: `kernel/` → `boot/` is justified by **collision**,
not by the word being banned. Laravel's `Kernel` is a request handler; ours is
startup wiring.

Nothing in this pass needs a `TERMINOLOGY.md` entry — every replacement is an
existing ecosystem word. Two items warrant `decisions/` notes (§A, §C5).

## When

Not yet. Everything here is a rename, so it conflicts with anything mid-flight
in the same files, and `roadmap/in-progress/` currently holds five features
including `ai-integration`, `media-admin-ui` and `media-browser-split`. The
2026-08-03 attempt was shelved for exactly this: coding agents were live in the
same tree.

Land §A as one branch, one commit. Splitting it means living with two
vocabularies mid-flight, which is worse than living with one wrong one. §C1,
§C2 and §E are independent and can go any time.

---

# §A — service / method / API / client vocabulary

The headline item. This is the one that has been revised before without
sticking.

## Why previous passes didn't stick

Each pass picked a better _word_ rather than deciding what the word _names_.
There isn't one concept here needing a name; there are four, and each currently
answers to two or three of {service, API, method, client}.

`entries.publish`, as currently named at each layer:

| Layer                            | Current name              | Word             |
| -------------------------------- | ------------------------- | ---------------- |
| File implementing it             | `entries/service.ts`      | service          |
| Exported value                   | `entries`                 | (bare)           |
| Type of that value               | `EntriesApi`              | API              |
| Per-method metadata              | `ServiceMethodDescriptor` | service + method |
| File holding that metadata       | `entries/descriptors.ts`  | descriptor       |
| Entry in the emitted catalogue   | `ManifestMethod`          | method           |
| Public subpath for the catalogue | `astromech/methods`       | method           |
| Permission-scoped bundle         | `ScopedService`           | service          |
| Assembled consumer object        | `AstromechClient`         | client           |
| Type file for the surface        | `types/api.ts`            | API              |
| Type file for the metadata       | `types/services.ts`       | service          |
| Type file for the bundle         | `types/client.ts`         | client           |

Counts in `src/`: `service` 185, `api`/`API` 134, `methods` 89.

Three type files (`api.ts` 404 lines, `client.ts` 316, `services.ts` 178) are
three views of the same operations, and none of their names says which view.

### Two collisions

**"API" already means the HTTP API.** `transport/local/index.ts:1-9` uses it both
ways in one docstring: "Astromech Local API […] the HTTP API is the enforcement
boundary."

**Both public clients export the same identifier.** `astromech/local` exports
`const Astromech: AstromechClient`; `astromech/fetch` exports
`const Astromech: AstromechClient` (`transport/http/client/index.ts:810`). Same
name, same type, different capabilities (local carries `content`, fetch can't).

### And the domains disagree with each other

Six domains, four export patterns:

```ts
entries/service.ts        export const entries: EntriesApi
media/service.ts          export const mediaApi
users/service.ts          export const usersApi
settings/service.ts       export const settingsApi: SettingsApi
content/service.ts        export const contentApi: ContentApi
notifications/service.ts  export const notificationsRepo
```

`notificationsRepo` is a rule violation, not just drift.
`decisions/0003` §"no repository wrapper" refused the repository layer, and
`.claude/skills/code/SKILL.md:49` says "**No repository pattern.** Every
DB-touching unit is _storage_. Name `createXStorage`, never `XRepository`." The
word came back abbreviated.

## The decision: one noun per role, never reused

| Role                                                     | Word        | Reads as                                                         |
| -------------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| A domain's callable operations, and their implementation | **service** | `entriesService: EntriesService`, in `entries/service.ts`        |
| One operation on a service                               | **method**  | `ServiceMethodDescriptor`, `ManifestMethod`, `astromech/methods` |
| The assembled object a consumer holds                    | **client**  | `AstromechClient`, `astromech/local`, `astromech/fetch`          |
| The HTTP surface                                         | **API**     | "the HTTP API", `transport/http/`                                |

Three of the four are already right and already stuck. **`method` is fully
consistent today** across descriptor, manifest, subpath, generator and CLI
command, which is the evidence the model works when applied. `client` is right.
`service` is right for the implementation. The only word doing double duty is
`Api`, in the one place the ecosystem has already claimed.

### A1. `*Api` types → `*Service`

`EntriesApi` → `EntriesService`, and likewise Media, Settings, Users, Content,
Notifications, plus `TypedEntriesApi` → `TypedEntriesService` and
`TypedEntriesApiFor` → `TypedEntriesServiceFor`.

The load-bearing move: frees "API" to mean HTTP only, and makes the type agree
with the file that implements it.

`AstromechApiError` (`transport/http/client/index.ts:41`) **keeps** its name — it
is thrown by the fetch client on an HTTP failure, so it is genuinely an API
error under the new scheme.

### A2. One export pattern across all six domains

`<domain>Service`:

| Current             | Replacement            |
| ------------------- | ---------------------- |
| `entries`           | `entriesService`       |
| `mediaApi`          | `mediaService`         |
| `usersApi`          | `usersService`         |
| `settingsApi`       | `settingsService`      |
| `contentApi`        | `contentService`       |
| `notificationsRepo` | `notificationsService` |

Verbose but unambiguous, matches the filename, and `mediaService` sidesteps the
collision with the `Media` type that `mediaApi` was presumably invented to dodge.
Bare (`media`, `users`) was considered and rejected for that reason.

### A3. Rename the three type files to say which view they hold

```
types/domain.ts    (unchanged)      the data
types/api.ts       → services.ts    the operations        (EntriesService, MediaService, …)
types/services.ts  → methods.ts     describing operations (ServiceMethodDescriptor, ManifestMethod)
types/client.ts    (unchanged)      the assembled object  (AstromechClient)
```

A readable progression, and `types/methods.ts` matches the `astromech/methods`
subpath it feeds. Do this as two commits or one rename-through-a-temp-name: the
two files swap the word `services` between them.

### A4. `<domain>/descriptors.ts` → `<domain>/methods.ts`

Six files (`entries`, `media`, `users`, `settings`, `content`, and
`notifications` if it gains one). They hold `ServiceMethodDescriptor`s;
`entries/descriptors.ts` already exports `ENTRY_METHOD_ACTIONS`,
`EntryMethodName`, `EntryMethodDescriptor`.

Also disambiguates "descriptor" — see §C4.

### A5. Give the two clients different names

`astromech/local` keeps `Astromech` (the ergonomic one used in Astro templates,
and what the docs show). `astromech/fetch` exports `client` or
`astromechClient`. Both keep their default export.

**Open — needs a decision.** The alternative is renaming the local one and
leaving `fetch` alone. Which is right depends on which appears more in
`apps/docs/`; check before implementing.

### Not doing: reviving "SDK"

Already gone, correctly. Only `src/` hits are `@modelcontextprotocol/sdk` (a
third-party path) and one prose mention of the AWS SDK in
`storage/drivers/s3.ts`. `ARCHITECTURE.md:72` records `sdk/` as dissolved in the
2026-06 refactor. "SDK" means a published package a third party installs, which
is what `astromech` itself is, so it cannot also name a layer inside it.

---

# §B — `policies/`

From the 2026-08-03 review. Five files, ~830 lines, 13 exported names.

### B1. `withPermissions` → `permissionsFor`

`with-permissions.ts:33`

```ts
export function withPermissions(principal: Role | undefined): Permissions;
```

`with*` is a settled prefix meaning wrapper/HOF (`withRouter`, `withStyles`,
`withAuth`, `withSentry`). A reader expects `withPermissions(handler)` → wrapped
handler. This takes a role and returns a `{ allows, allowsMethod }` predicate
bag: a factory, not a decorator.

The cost is already paid. `scoped-service.ts:16-21` is the actual wrapper, and
its header spends a paragraph explaining it "does NOT replace `withPermissions`",
most of which is disambiguating the name.

`permissionsFor(role)` reads correctly at every call site, is the conventional
shape for a role→capability lookup, and collides with nothing (0 hits
repo-wide). The returned methods (`allows`, `allowsMethod`) stay — Laravel's
Gate uses `allows()`.

Sites: 6 HTTP routes (`entries`, `settings`, `content`, `users`, `media`,
`plugins`), `scoped-service.ts`, `tests/policies/scoped-service.test.ts`.

### B2. `principal` → `role`

32 occurrences across 7 src files. `principal` is IAM/Spring/.NET vocabulary for
_the identity_ — a user, a service account, an assumed role. Here the parameter
is typed `Role | undefined` and holds a role string.

`types/plugins.ts:94-98` has to translate:

```ts
/**
 * The acting user's role, or null outside a request context. Read from the
 * request-scoped store, so it is the principal `scopedService` expects.
 */
role: Role | null;
```

A field named `role`, typed `Role`, documented as "the principal".
`decisions/0005` settled on `ctx.role`; `policies/` didn't follow.

Keep `principal` only if it is meant to become a user or identity object. It
isn't one today, and a name reserving space for a future type costs every
present reader.

Files: `with-permissions.ts`, `scoped-service.ts`, `annotate-manifest.ts`,
`tool-surface.ts`, `errors/permission.ts`, `types/plugins.ts`,
`transport/mcp/dispatch.ts` (last three are prose only).

**Not naming, fix while in there:** `policies/` takes `Role | undefined` while
`ctx.role` is `Role | null`.

### B3. `reduceSurface`/`Surface*` → `filterMethods`/`MethodFilter`/`FilterResult`

"Surface" names a quality, not a thing. The file's own header (lines 10-16)
names the ecosystem convention it copies: GitHub's and Stripe's MCP servers ship
`--read-only` as a **filter**. The code agrees — options are `include`/`exclude`,
the result field is `excluded`, the private helpers are `matches`/`matchesAny`.
Filter vocabulary throughout, with "surface" bolted on top.

`reduceSurface` as a verb phrase isn't guessable: nobody predicts "reduce a
surface" means "drop methods from a list".

| Current                           | Replacement                      |
| --------------------------------- | -------------------------------- |
| `reduceSurface(methods, options)` | `filterMethods(methods, filter)` |
| `SurfaceOptions`                  | `MethodFilter`                   |
| `SurfaceResult`                   | `FilterResult`                   |
| `tool-surface.ts`                 | `method-filter.ts`               |
| `transport/cli/surface-args.ts`   | `transport/cli/filter-args.ts`   |

`ExcludedMethod` stays. Keep the distinction the header draws (what a transport
_offers_ vs what a role _may do_); "filter" carries it.

Sites: `transport/mcp/index.ts`, `transport/cli/commands/mcp.ts`,
`transport/cli/commands/methods.ts`, `transport/cli/surface-args.ts`,
`exports/methods.ts`, `tests/policies/tool-surface.test.ts`,
`tests/policies/methods-export.test.ts`, `tests/transport/mcp/parity.test.ts`.
Public via `astromech/methods`.

### B4. `ScopedService` → `ScopedServices` ⚠️ supersedes the 2026-08-03 spec

`scoped-service.ts:282` holds five `*Api` fields in a container calling itself a
singular `Service`.

**The deleted spec said `ScopedApis`**, reasoning that the fields are all `*Api`.
Under §A1 they become `*Service`, so the container is `ScopedServices` and the
file is `scoped-services.ts`. Don't re-derive `ScopedApis` from the old
reasoning; it was correct only under the vocabulary §A replaces.

`scopeMethods` / `scopeEntries` / `scopeContent` stay — verb, clear object, and
the divergence between the three is real.

Several docstrings name `policies/scoped-service.ts` by path
(`tool-surface.ts:22`, `confirm-gate.ts:16`, `annotate-manifest.ts:8`,
`transport/mcp/dispatch.ts:55`, `ARCHITECTURE.md`) and need updating.

Public via `astromech/methods`.

### B5. `GateOutcome` → `ConfirmOutcome`, `confirm-gate.ts` → `confirmation.ts`

The file exports `ConfirmAction`, `ConfirmAnswer`, `ConfirmRequest`,
`ConfirmTrigger`, `ConfirmOptions`, `ConfirmDecision`, `evaluateConfirmation`,
`triggersConfirmation`, `CONFIRM_KEY` — and `GateOutcome`. One name in ten uses
a different noun for the same subject.

"Gate" is also the security-boundary word (auth gate, feature gating, Laravel's
Gate), and the header spends lines 13-17 insisting this is not one:

> This is NOT a security boundary and must never be described as one.

The name fights its own docstring, and the "runaway-loop brake" framing on line 2
has already abandoned it conceptually.

**Parked deliberately:** `ConfirmAnswer` / `ConfirmDecision` / `ConfirmOutcome`
is three result-ish nouns a reader must keep straight (the caller's reply / the
verdict / why it stopped). Each is right alone; the cluster is the cost. A
pointer line in the header is cheaper than churning them.

**Rejected:** renaming the flow to MCP's **elicitation** (`ConfirmRequest` ≈
`ElicitRequest`), which the file already borrows the three actions from.
"Confirm" is guessable without MCP knowledge; "elicit" isn't.

Public via `astromech/methods`.

### B6. Move `with-permissions.ts` into `permissions/`

`policies/` and `permissions/` are sibling directories whose names don't
distinguish them. `ARCHITECTURE.md` describes them as "permission/confirmation
wrappers over the manifest" and "permission model: roles, grammar,
`BUILT_IN_ROLES`, `can()`". In the wider ecosystem (IAM, OPA, Casbin) a "policy"
_is_ the rule document, which is what `permissions/` holds, so the names are
arguably inverted.

`with-permissions.ts` imports `can()` from `permissions/` and returns a
role-bound wrapper of it. It belongs to the permission model. Moving it leaves
`policies/` as one coherent thing: what a transport applies to the manifest
before dispatch (scope, filter, annotate, confirm).

**Parked:** renaming `policies/` → `guards/`. The code reaches for "guard"
already (`with-permissions.ts:4` "a permission guard", `scoped-service.ts:8` "the
single enforcement seam", both "fails CLOSED"), and NestJS/Angular/Vue Router all
use it for this. Against: `tool-surface` is a filter and `confirm-gate` is a
brake, so it fits 3 of 5 files, and it swaps one imperfect umbrella for another.
Revisit once `ai-integration` lands and the directory's real job is settled.
Write it up in `decisions/` either way.

### B7. `decide` → `allowedFor`

`annotate-manifest.ts:30`. Verb with no object. `allowedFor(method, role)`
matches the `allowed` field it populates.

### Not touching

`wantsFullShape`, `targetedTypes`, `targetedContentType`, `matches`,
`matchesAny`, `stripConfirm`, `describeTarget`, `readAnswer`,
`resolvePermission`, `CONFIRM_KEY`, `DescriptorCatalogue`, `ServiceRecord`,
`ServiceFn`, `AnnotatedManifestMethod`, `annotateManifest`, `ExcludedMethod`.
Question-form booleans, verb-phrase helpers, no abbreviations.

---

# §C — module and concept names

### C1. `kernel/` → `boot/`

Holds `boot.ts`, `astro.ts`, `config-resolver.ts`, `route-registration.ts`,
`admin-config.ts`, `relationship-index.ts`.

Laravel's `Kernel` (the origin of the name here) is a **request handler**:
`app/Http/Kernel.php` takes a request through a middleware stack to a response,
`app/Console/Kernel.php` does the same for commands. Symfony's `HttpKernel` is
the same shape. Astromech's `kernel/` is startup wiring and handles no requests.
The word is taken and this isn't the taken meaning.

`boot/` needs no invention — the directory already contains `boot.ts`.
`bootstrap/` also works.

Public subpath `astromech/astro` resolves to `dist/kernel/astro.js`, so the
subpath is unaffected; only the dist path changes.

### C2. `context/` → `request-context/`

`TERMINOLOGY.md` §"AI context" closes with:

> The `AI` prefix is load-bearing — bare "context" in this codebase means React's.

And there is a capability directory named `context/`, holding the
AsyncLocalStorage request store. The file inside is already correctly named
`request-context.ts`; `ARCHITECTURE.md` already describes it as "shared server
request-context". The rule was written after the directory.

### C3. `content/` → ? ⚠️ unresolved, needs a conversation

A downstream domain whose service is `translate` / `transform` / `generate`,
rewriting entry fields through a registered model (`ContentProvider`,
`ContentRewriteRequest.rewrite`).

In a CMS, "content" means everything the CMS manages. Entries are content. Media
is content. This directory is model-backed text rewriting sitting as a sibling to
`entries/` and `media/`, implying it's a peer category of stuff rather than an
operation over them. `ARCHITECTURE.md:110` has to spell out the relationship
because the name doesn't: "content operations (translate/transform/generate) — a
DOWNSTREAM domain: it may import entries/, never the reverse."

Candidates: `authoring/` (the user-facing activity — but now collides with the
`@astromech/authoring` plugin, which shipped 2026-08-03), `rewriting/` (what the
code does), `ai/` (what powers it). `ContentProvider` → `ModelProvider` reads
better than any of the domain renames it would accompany.

**Do not action from this spec.** Lowest-confidence item here; the plugin
collision arrived after the review and changes the shortlist.

### C4. "Descriptor" names four things — fixed by §A4, no type renames

`TableDescriptor` (60 uses), `ServiceMethodDescriptor` (25),
`FieldTypeDescriptor` (10), `MessageDescriptor` (4).

The _types_ are fine: each is qualified, and "descriptor" as "a data description
of X" has precedent (property descriptors, sort descriptors). The problem is the
bare filename — `<domain>/descriptors.ts` means service methods,
`fields/descriptors.ts` means field types, and `ARCHITECTURE.md` says "the core
`defineTable` descriptors" meaning tables. "The descriptors" is unparseable.

§A4 renames `<domain>/descriptors.ts` → `methods.ts`, after which bare
"descriptor" means table-or-field, both schema-shaped. Nothing else to do.

### C5. `dispatch` lives under `transport/mcp/` but serves three transports

`buildDispatch` and `buildScopedDispatch` are exported from `astromech/methods`
and used by the CLI, the MCP server and the in-process tool loop, but live in
`transport/mcp/dispatch.ts`. Same species as §E1: a shared thing filed under one
of its consumers.

Move to `transport/dispatch.ts`, or to `policies/` if §B6's reshaping makes that
the pre-dispatch layer. Worth a `decisions/` line since it interacts with the
parked `guards/` question.

### C6. `manifest-registry.ts` is in `codegen/` but isn't codegen

`codegen/` holds `type-generator.ts`, `method-manifest.ts`,
`plugin-client-manifest.ts` (all generators) and `manifest-registry.ts`, which
`ARCHITECTURE.md:95` describes as "the boot-generated copy" read at runtime.
`getMethodManifest` is public and resolves here.

Either move it to `boot/` (§C1) or accept it and say so in the file header.
Small, but it sends people grepping the wrong directory.

---

# §D — public subpaths disagree with the source

| Public subpath                             | Source                                | Mismatch                       |
| ------------------------------------------ | ------------------------------------- | ------------------------------ |
| `astromech/db/schema`, `astromech/db/d1`   | `src/database/`                       | `db` vs `database`             |
| `astromech/images/{sharp,cloudflare}`      | `src/media/serving/image/`            | `images` vs `image` vs `media` |
| `astromech/Image`                          | `src/media/serving/image/Image.astro` | only capitalised subpath of 20 |
| `astromech/ui`, `/ui/fields`, `/ui/layout` | `src/admin/components/`               | `ui` vs `admin`                |

`ARCHITECTURE.md:118` records the first as deliberate ("was db/; public subpath
unchanged"), which made sense when there were consumers to avoid breaking. There
aren't any. Pre-1.0 is the moment to make the public word and the internal word
the same: `astromech/database/schema` costs nothing now and is unfixable later.

`astromech/images/sharp` vs `astromech/storage/r2`: singular/plural mismatch
between two otherwise parallel driver families. Pick one.

`astromech/Image` is defensible (it's a component) but it's the one odd member of
an import list. `astromech/media/image` would fold it in.

---

# §E — documentation corrections

### E1. `ARCHITECTURE.md` lists a directory that doesn't exist

Lines 32 and 98 both put `client/` at the top level of `src/`:

```
client                                         consumes the HTTP API over the wire
├── client/         # fetch Client (astromech/fetch) — talks HTTP, no server imports
```

There is no `src/client/`. It's `src/transport/http/client/`. That's a
materially different claim: the layer model says the fetch client is its own
layer between transports and entrypoints; the code says it's a leaf inside the
HTTP transport. Per `CLAUDE.md`, the code wins, so the file gets fixed.

Worth a second look at whether the _code_ is where you want it, though. A client
that "talks HTTP, no server imports" living under `transport/http/` next to the
Hono server routes is a surprising home. If it moves, `ARCHITECTURE.md` was right
and the code was wrong.

### E2. `ARCHITECTURE.md:72` is stale

"(`core/`, `sdk/`, `api/` no longer exist)" is true of directories, but
`types/api.ts` is alive at 404 lines. §A3 clears it; update the line then.

### E3. Project `CLAUDE.md` naming section

Match the global file's 2026-08-04 split: add `engine`, `pipeline`, `kernel` to
the taken-in-domain bullet, and move `orchestrator` there from the quality
bullet (orchestration is a real thing — Kubernetes, workflow engines — that
rarely describes what someone's reaching for it to describe).

---

# §F — table descriptor exports take a `Table` suffix

Added 2026-08-04, from the entries review. Repo-wide, not entries-only.

Every `defineTable` export in core is a bare plural noun — `entries`, `media`,
`settings`, `roles` — which is also the domain word, the service word and (for
`entries`) the name of an existing export in the same directory. The suffix marks
it as the low-level table object rather than anything at service altitude.

**The code already does this whenever it has to hold two of them at once.**
`database/schema.ts:26-32` aliases all seven imported descriptors on the way in,
because `CORE_TABLES` (`:175-186`) cannot reference the bare names:

```ts
import { roles as rolesTable } from '@/users/schema.js';
import { entries as entriesTable, entryVersions as entryVersionsTable, … } from '@/entries/schema.js';
import { media as mediaTable } from '@/media/schema.js';
```

`entries/internal/relationships.ts:14` does the same locally. And all three
plugin tables already ship the suffix: `backupRunsTable`
(`plugins/backups/src/tables/runs.ts:11`), `submissionsTable`, `redirectsTable`.
Core is the only holdout, so this aligns core with the published convention
rather than inventing one.

| Current              | Replacement               | Defined in                  |
| -------------------- | ------------------------- | --------------------------- |
| `entries`            | `entriesTable`            | `entries/schema.ts:17`      |
| `entryVersions`      | `entryVersionsTable`      | `entries/schema.ts:61`      |
| `entryPreviewTokens` | `entryPreviewTokensTable` | `entries/schema.ts:77`      |
| `media`              | `mediaTable`              | `media/schema.ts:9`         |
| `settings`           | `settingsTable`           | `settings/schema.ts:9`      |
| `notifications`      | `notificationsTable`      | `notifications/schema.ts:7` |
| `roles`              | `rolesTable`              | `users/schema.ts:41`        |
| `relationships`      | `relationshipsTable`      | `database/schema.ts:85`     |
| `cron`               | `cronTable`               | `database/schema.ts:127`    |
| `plugins`            | `pluginsTable`            | `database/schema.ts:153`    |

Blast radius: 25 descriptor value-import lines (11 in `src/`, 13 in `tests/`),
plus `database/schema.ts` itself. Deletes eight aliases. Row types
(`EntryRow`, `NewEntryRow`, …) are unaffected — they are already suffixed.

Public via `astromech/db/schema`, which re-exports the bare names today. Pre-1.0
with no external consumers; same argument as §D.

**Singular vs plural stays as-is.** The suffix names the kind of object; the noun
keeps matching the SQL table name (`entries` → `entriesTable`, `media` →
`mediaTable`). Don't also try to regularise the noun.

**Not redundant with §A2.** §A2 renames the entries _service_ to
`entriesService`; §F renames the entries _table_ to `entriesTable`. Either alone
resolves the `entries` collision (§G2), but each is independently justified — one
for cross-domain export consistency, one for marking table altitude — so do both.

`definePluginTable` needs no change. Its authoring guidance should state the
suffix explicitly so third-party plugins don't drift back to bare nouns.

---

# §G — the `entries` module, internally

Added 2026-08-04. §A and §F cover entries from the outside (`EntriesApi` →
`EntriesService`, `entries` → `entriesService`/`entriesTable`,
`descriptors.ts` → `methods.ts`). This is the review of the 52 files inside it.

### G1. `capabilities` and `supports` are two right names in the wrong two files

`storage/capabilities.ts:16` exports `BUILT_IN_SUPPORTS`. `internal/supports.ts:14`
exports `assertCapability`. Each file is named for the other one's axis.

Both axes are real and neither is redundant:

- **`supports`** — what a storage backend _can_ do. `EntryStorage.supports`,
  `BUILT_IN_SUPPORTS`, `tableStorage`'s `supports: []`.
- **`capabilities`** — what an entry type has _turned on_.
  `EntryTypeConfig.capabilities`, `ResolvedEntryCapabilities`.

`resolveEntryCapabilities(cfg, storageSupports)` takes the first and returns the
second, so collapsing them loses information.

Fix by deleting the misnamed file rather than renaming it. `assertCapability` is
a config-derived check and belongs beside `isVersioningEnabled` / `getTitleField`
in `internal/type-config.ts`; `getStagingStorage` is a storage resolver and
belongs in `storage/registry.ts`. `storage/capabilities.ts` keeps its name.
`service.ts:6` says "supports gating" where it means capability gating.

**This closes the blocked `entries-module-reshape` Layer 2 bullet.** That bullet
proposed `EntryTypeConfig.capabilities` → `supports` and was parked needing "a
third name, or dropping". Drop it: the collision was the code reporting that
there are two axes, and the fix is the filenames.

### G2. `entries` names two different exports in one directory

`entries/schema.ts:17` exports `const entries` (the table descriptor);
`entries/service.ts:33` exports `const entries` (the service). Eight CLI and
transport files import the bare name meaning the service; `storage/built-in.ts:38`
and `storage/maintenance.ts:14` import it meaning the table;
`internal/relationships.ts:14` aliases it to survive.

Resolved by §A2 + §F. No separate work.

### G3. `incomingRelations` breaks the rule the rest of entries follows

`TERMINOLOGY.md` §"Relation vs Relationship": **relation** is the field type,
**relationship** is the index row. `IncomingRelation`'s own docstring
(`types/api.ts:104-113`) says "One relationships-index edge" — it is a
relationship.

| Current                        | Replacement                   |
| ------------------------------ | ----------------------------- |
| `incomingRelations`            | `incomingRelationships`       |
| `IncomingRelation`             | `IncomingRelationship`        |
| `operations/relations.ts`      | `operations/relationships.ts` |
| `useIncomingRelations` (admin) | `useIncomingRelationships`    |

12 src files and 5 tests. Public via the manifest, `transport/http/routes/entries.ts`
and the fetch client, so `tests/transport/mcp/parity.test.ts` moves with it.

`pruneDanglingRelations` **stays** — it strips dead ids out of relation _fields_,
not out of the index, so it is on the other axis. Because
`internal/dangling-relations.ts` sits next to `internal/relationships.ts`, its
header gets one line saying which.

`MediaUsage` is documented as "the media mirror of `IncomingRelation`" while
sharing no name with it. Out of scope here; note it for a media pass.

### G4. `relationshipsRepo` survived the de-repository sweep

Eight sites across `operations/delete.ts`, `operations/trash.ts` and
`jobs/trash-purge.ts`, all `const relationshipsRepo = createRelationshipStorage(db)`.
`.claude/skills/code/SKILL.md:49` says "never `XRepository`", and §A2 renames
`notificationsRepo` for the same reason. Reshape Layer 1 caught the exported
classes and missed the locals. → `relationships`.

### G5. `type-registry.ts` isn't a registry

`storage/registry.ts` is one: `globalThis` state, `get`/`set`/`has`/`reset`.
`type-registry.ts` holds three pure functions over config (`parseEntryTypeId`,
`qualifyEntryType`, `resolveEntryType`) and registers nothing. → `type-ids.ts`.

`resolveEntryType` cannot move to `internal/type-config.ts` where the other
config lookups live: that file imports `virtual:astromech/config`, and
`plugin-access.ts` is deliberately service-free (see its header). Rename the
file, leave the contents.

### G6. Four form slips

| Current                                     | Replacement              | Why                                                                                 |
| ------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `entryHooksActive` (`internal/hooks.ts:19`) | `hasEntryHooks`          | boolean without an `is`/`has` prefix                                                |
| `entrySnapshot` (`internal/hooks.ts:23`)    | `loadEntrySnapshot`      | async storage load named as a noun                                                  |
| `force` param (`internal/hooks.ts:31`)      | `permanent`              | `TERMINOLOGY.md` §"Trash vs Delete" disowns the word: "there is no `forceDelete()`" |
| `internal/diff.ts`                          | `internal/deep-equal.ts` | its only export is `deepEqual`                                                      |

### G7. `internal/validation.ts` collides with what validation means here

It is a five-line zod `safeParse`-and-throw exporting `validate`. In this
codebase "validation" is the coerce → default → validate field pipeline with a
`ValidationStage`, and `validation-stage.ts` is two directories up in the same
module. → `internal/parse.ts`, exporting `parseWith(schema, data)`.

### Not changing — recorded so a later pass doesn't reopen them

- **`tableStorage` has no `create` prefix**, unlike `createBuiltInEntryStorage`,
  `createVersionStorage`, `createPreviewTokenStorage`,
  `createEntryMaintenanceStorage`, `createRelationshipStorage`. It is a
  config-time authoring call (`storage: tableStorage(redirectsTable)`) published
  in plugin packages, where `create` reads wrong. `TERMINOLOGY.md` already uses
  the bare name.
- **`EntryRecord`** looks like it breaks `TERMINOLOGY.md` §"Entry vs Record"
  ("avoid saying record"), but it is deliberately the storage-seam shape that
  `asEntry` narrows to `Entry`. The doc is missing the exception — see
  Deliverables.
- **`storage/built-in.ts` → `storage/entries.ts`**, the last cosmetic bullet on
  `entries-module-reshape` Layer 2: **won't do.** `entries.ts` inside
  `entries/storage/` re-creates §G2, and "built-in storage" is already the
  consistent term across `TERMINOLOGY.md`, `BUILT_IN_SUPPORTS` and
  `createBuiltInEntryStorage`.
- **Service `query()` vs storage `list()`** is two layers using two words
  consistently, matching media and users. Leave it.

---

# What's working — don't churn it

Stated so a future pass doesn't rediscover and "fix" these:

- **`method` vocabulary is fully consistent** across descriptor, manifest,
  subpath, generator and CLI command. This is the model §A copies.
- **`driver`** is defined in `TERMINOLOGY.md`, applied uniformly across
  database/storage/email/cron/image, with the "why not adapter" comparison
  recorded.
- **`transport/`** with `http`/`local`/`cli`/`mcp` beneath it.
- **Domain names** (`entries`, `media`, `users`, `settings`, `notifications`) are
  business words, not tech words, as the invariant asks.
- **`exports/`** maps 1:1 onto `package.json` exports.
- **`fields/pipeline.ts`** and **`@astromech/schema-engine`** are correct uses of
  words the old banned list forbade. They are why the list changed.
- **`entries/operations/*` per-file verbs** (`create`, `update`, `trash`,
  `restore`, `duplicate`, `createStaged`, `mergeStaged`) match the service
  methods 1:1. The `deleteEntry` / `updateOne` / `trashOne` split is the reserved
  word plus the bulk-vs-single seam, not drift.
- **`pruneDanglingRelations`**, **`tableStorage`**, **`EntryRecord`**,
  **`built-in.ts`** and service `query()` vs storage `list()` — all considered in
  §G and deliberately left alone. Reasons are recorded there.

---

# Order

|     | Change                                      | Blast radius             | Public | Depends on |
| --- | ------------------------------------------- | ------------------------ | ------ | ---------- |
| 1   | §C1 `kernel/` → `boot/`                     | dist paths               | no     | —          |
| 2   | §C2 `context/` → `request-context/`         | imports                  | no     | —          |
| 3   | §E1, §E2, §E3 doc fixes                     | docs only                | no     | —          |
| 4   | §B2 `principal` → `role` (32 sites)         | mechanical               | no     | —          |
| 5   | §B1 `withPermissions` → `permissionsFor`    | 6 routes + tests         | no     | —          |
| 6   | §G1 dissolve `entries/internal/supports.ts` | 2 files                  | no     | —          |
| 7   | §G4 `relationshipsRepo` → `relationships`   | 3 files, locals          | no     | —          |
| 8   | §G5 `type-registry.ts` → `type-ids.ts`      | imports                  | no     | —          |
| 9   | §G6 + §G7 entries form slips                | small                    | no     | —          |
| 10  | §A1 `*Api` → `*Service`                     | wide                     | yes    | —          |
| 11  | §A2 domain export names                     | 6 domains + consumers    | no     | 10         |
| 12  | §A3 type file renames                       | imports                  | no     | 10         |
| 13  | §A4 `descriptors.ts` → `methods.ts`         | 6 files + imports        | no     | 12         |
| 14  | §B4 `ScopedService` → `ScopedServices`      | small                    | yes    | 10         |
| 15  | §B5 `GateOutcome` → `ConfirmOutcome`        | small                    | yes    | —          |
| 16  | §B3 `Surface*` → `MethodFilter`             | MCP + CLI + tests        | yes    | —          |
| 17  | §B6 move `with-permissions.ts`              | imports                  | no     | 5          |
| 18  | §B7 `decide` → `allowedFor`                 | one file                 | no     | —          |
| 19  | §F table `Table` suffix                     | 25 imports + `db/schema` | yes    | —          |
| 20  | §G3 `incomingRelations` → `…Relationships`  | 12 src + 5 tests         | yes    | —          |
| 21  | §D public subpaths                          | `package.json`, demo     | yes    | 1          |
| 22  | §A5 client export names                     | docs + demo              | yes    | decision   |

1-9 break nothing published. 10-22 change `astromech/methods`,
`astromech/db/schema` and the root export; pre-1.0 with no external consumers, so
cheap now and expensive later.

§F and §A2 (11) each independently resolve the `entries` collision (§G2) and
neither blocks the other, but doing 11 first means the bare `entries` is
unambiguously the table for the rest of the pass.

Deferred, not scheduled: §C3 (`content/`), §C5 (dispatch placement), §C6
(`manifest-registry.ts`), and the parked `policies/` → `guards/` question.

# Verification

Renames only, no behaviour change. The suite should pass at the current baseline
with import and identifier edits alone.

- `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build`,
  `npm run lint:deps`
- **`tests/policies/methods-export.test.ts` asserts the exact export list of
  `astromech/methods` by name.** It must change in the same commit or it fails.
  That's the intended tripwire for items 10-12.
- After §C1/§C2/§B4: grep for stale path references in docstrings.
  `policies/scoped-service.ts` alone is named by path in five places.
- After §D: `apps/demo` has no typecheck script, so a broken subpath import only
  surfaces on a demo boot. Run one.
- `npm run db:generate` must report "No schema changes". §F renames descriptor
  _identifiers_, never the SQL table names they carry, so a diff there means the
  rename reached into `defineTable`'s first argument.
- After §F: `tests/db/descriptor-snapshot.test.ts` imports five descriptors by
  bare name and is the tripwire for a half-applied rename.
- After §G3: the manifest, `transport/http/routes/entries.ts`, the fetch client
  and `tests/transport/mcp/parity.test.ts` all carry the method name. It changes
  in one commit or parity fails.

# Deliverables beyond the code

- [ ] `decisions/0008-service-method-client-vocabulary.md` — §A's four-role model,
      what "API" was narrowed to and why, and the three prior revisions it
      replaces. This is the item most likely to be re-litigated; record it.
- [ ] `decisions/` note for §B6 / the parked `guards/` question, whichever way it
      resolves.
- [ ] `ARCHITECTURE.md` layer model and directory map, for §C1, §C2, §D, §E1, §E2.
- [ ] `TERMINOLOGY.md` — no new entries needed, but three existing ones change:
      "Schema vs Tables" gains the §F suffix convention and should be checked
      against §A4; "Entry vs Record" gains the `EntryRecord` exception (the
      storage-seam shape `asEntry` narrows to `Entry`); "Entry vs Table (as data
      worlds)" should state that `supports` and `capabilities` are two axes, per
      §G1.
- [ ] `.claude/skills/code/SKILL.md` — add the §F suffix to the storage-pattern
      section, next to `createXStorage`. It is the rule that would have caught
      this.
- [ ] `definePluginTable` authoring docs in `apps/docs` — state the suffix so
      third-party plugins don't drift back to bare nouns.
- [ ] `roadmap/in-progress/entries-module-reshape.md` — §G1 closes the blocked
      `capabilities` → `supports` bullet and §G's "not changing" list closes
      `built-in.ts` → `entries.ts`. Both are marked there already; delete them
      from Layer 2 when this lands.
- [ ] Delete this spec when the work lands, per the specs-are-ephemeral
      convention.
