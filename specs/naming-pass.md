# Naming pass — what is still open

**Items 1–22 of this plan shipped on 2026-08-04** and have been removed from
this file. What landed, and where, is in `roadmap/in-progress/naming-pass.md`;
the headline decisions are `decisions/0009-service-method-client-vocabulary.md`
and `decisions/0015-public-subpaths-mirror-the-source.md`.

What remains is below: §I, the one section that was never in the order table,
and four questions parked for a later conversation. §H, the `fields` module, and
§J, the `resource` vocabulary, both shipped on 2026-08-04 — see
`roadmap/in-progress/naming-pass.md`,
`decisions/0016-the-fields-module-vocabulary.md` and
`decisions/0017-resource-as-the-superordinate-noun.md`.

Everything here is still a rename with no behaviour change, so the same
constraint applies: land it when `roadmap/in-progress/` is quiet, because it
conflicts with anything mid-flight in the same files.

## Ordering

§I has an internal dependency: the admin `TableDefinition` must become
`ResolvedTable` before `TableDescriptor` can become `Table`. `FieldDefinition` →
`Field` goes last — widest diff, no dependents.

§I needs a `TERMINOLOGY.md` entry, and it overturns an existing one.

# §I — definitions are objects, so they take the bare noun

Added 2026-08-04. Repo-wide. This supersedes the descriptor-vs-definition
question and amends §A and §F.

## The rule

**A `defineX` returns an `X`.** The runtime or derived form takes the qualifier,
using the prefixes the repo already has: `Resolved*`, `Registered*`,
`Collected*`.

Both `Descriptor` and `Definition` disappear as suffixes.

## Why not "definition"

Because a definition implies something carrying information and no behaviour, and
half of these carry behaviour. `FieldTypeDescriptor` holds `build`, `coerce`,
`validate` and `children`: an object, not a description of one. Every previous
attempt at this vocabulary broke on the same rock, reaching for "definition" and
then meeting something that was an actual object.

The word was never the problem. Suffixing was.

## Why the bare noun is available

The apparent collisions do not survive being allowed to rename, and two
incumbents have the weaker claim:

- **`type FieldType = AnyFieldType`** is a union of string literals. `'text'` is
  the _name_ of a field type, not the field type. The record that says how it
  builds, coerces and validates is the field type. The union becomes
  `FieldTypeName`, which is more accurate than what it is called now.
- **`EntryTypeConfig`** already forces a double qualifier at 18 sites:
  `ResolvedEntryTypeConfig` is `Resolved` + `EntryType` + `Config`. Under the
  rule it is `ResolvedEntryType`.

And the qualifying convention for the other side is already in place and well
populated: `ResolvedConfig` 59, `ResolvedEntryFields` 25, `ResolvedPluginIdentity`
19, `ResolvedEntryTypeConfig` 18, `ResolvedAdminPage` 18, plus `RegisteredHook`,
`RegisteredRawRoute`, `CollectedPluginTable`, and six more `Resolved*`.

`DefinedHook` (5 uses) exists because the codebase needed this distinction, had
no convention, and improvised a prefix on the wrong side. Under the rule it is
`Hook`, with `RegisteredHook` keeping its qualifier — which also puts the
qualifier on the rarer, more specific thing.

## Ecosystem

`defineComponent` → a component. `defineStore` → a store. `defineConfig` → a
config. Drizzle's `pgTable()` → a table object. Vue, Pinia, Vite and Drizzle all
give the bare noun to the definition. That is Astromech's actual neighbourhood.

## The renames

| Factory                 | Returns                                         | Runtime form           |
| ----------------------- | ----------------------------------------------- | ---------------------- |
| `defineTable`           | `Table` (was `TableDescriptor`)                 | not held in TS         |
| `defineServiceMethod`   | `ServiceMethod` (was `ServiceMethodDescriptor`) | —                      |
| `defineFieldType` (new) | `FieldType` (was `FieldTypeDescriptor`)         | —                      |
| `defineEntryType`       | `EntryType` (was `EntryTypeConfig`)             | `ResolvedEntryType`    |
| `defineHook`            | `Hook` (was `DefinedHook`)                      | `RegisteredHook`       |
| `defineCommand`         | `Command`                                       | —                      |
| `defineAdminPage`       | `AdminPage`                                     | `ResolvedAdminPage`    |
| `definePluginTable`     | `PluginTable`                                   | `CollectedPluginTable` |
| `fields.text()` etc     | `Field` (was `FieldDefinition`)                 | —                      |
| `fields.block()`        | `Block` (was `BlockDefinition`)                 | stored block instance  |

**`defineRegistry` → `createRegistry`** (24 uses). It returns a runtime slot with
`{set, get, peek}`. Nothing is defined; a thing is created, and `createStorage`
is the family it belongs to. The rule found this on its own, which is the
evidence it has teeth.

**`definePlugin` keeps returning a factory**, per the recorded decision. It
becomes the one documented exception rather than an unnoticed inconsistency.

**`AstromechConfig` stays.** `defineConfig` → config is its own universal
convention.

## Three deliberate decisions, not mechanical ones

**I1. `ServiceMethod` vs `PluginServiceMethod`.** The first becomes the object;
the second is the _callable signature_. They read as siblings and are not.
Rename the callable **`ServiceMethodFn`**, or fold it into the existing
`ServiceInterface` mapping.

**I2. `Table` and `TERMINOLOGY.md`.** The "Entry vs Table (as data worlds)" entry
uses "Table" for a whole data world (a plugin-defined custom table with its own
storage, `supports: []`). Drizzle's precedent says the TS name is fine; the work
is rewording that entry so prose and type don't drift.

**I3. Overturning `EntryTypeConfig`.** `TERMINOLOGY.md` chose that name
explicitly "to avoid ambiguity". Reversing a documented decision goes in
`decisions/` with the reason: the ambiguity is handled better by
`ResolvedEntryType` than by a `Config` suffix on the authored form.

## `fields.text()` and `col.text()` are in scope

They are definition factories with a different spelling, and `FieldDefinition` is
the most-used name in the family, so excluding them would undercut the rule.
`Field` is available (the admin components are `BooleanField`, `BlocksField`; no
field _value_ is typed as `Field`).

That puts `Field` (a spec) beside `Entry` (a stored row) in `types/`. The pair
holds because `Entry`'s spec is `EntryType`, not `EntryDefinition`: `EntryType` /
`Entry` and `Field` / field values are the same shape. Worth stating in
`TERMINOLOGY.md` so the asymmetry reads as deliberate.

## `MessageDescriptor`

`types/fields.ts:62`, `{ $t: string }`. It borrows FormatJS's name without
FormatJS's shape (`{id, defaultMessage, description}`), and its factory is `t()`,
not a `defineX`. The borrowed name isn't earning its keep. **`MessageRef`** says
what it is: a reference to a message in a catalogue. Small; can ride along or be
skipped.

## How this lands on what already shipped

**§A (shipped).** `<domain>/descriptors.ts` is already `<domain>/methods.ts`,
which this rule justifies twice over — the files hold `ServiceMethod` objects.
What remains is the type itself: `ServiceMethodDescriptor` → `ServiceMethod`,
and `PluginServiceMethod` → `ServiceMethodFn` alongside it (see I1).

**§F (shipped).** The `Table` suffix on the exported const composes cleanly with
this: `export const entriesTable: Table = defineTable(...)`. The const keeps the
suffix, the type sheds `Descriptor`. Still to do: reword the surviving "table
descriptor" prose to "table", and rename `database/descriptor-snapshot.ts` →
`table-snapshot.ts`.

**Field types.** `FieldTypeDescriptor` → `FieldType` throughout, and
`fields/descriptors.ts` → `fields/field-type-registry.ts` (it holds
`registerFieldType` / `getFieldType`), with `core-descriptors.ts` →
`core-field-types.ts`. `fields/descriptors.ts` was deliberately left out of §A4
for exactly this reason — it is the field-type registry, not a method
catalogue.

## Ordering

There is one collision to clear first.

1. Admin `TableDefinition` / `FormDefinition` → `ResolvedTable` / `ResolvedForm`;
   `types/definitions.ts` → `types/resolved.ts`; `admin/definitions/` →
   `admin/rendering/`. These are **derived** (`admin/definitions/derive.ts`
   derives them from `AdminEntryTypeConfig`), so `Resolved*` is exactly right and
   they were never definitions. _Rejected: `TableInterface` (collides with the
   `interface` keyword and with "interface" as an API boundary) and `TableShape`
   ("shape" is spent on the public/full visibility axis)._
2. Then `TableDescriptor` → `Table`.
3. `ServiceMethodDescriptor` → `ServiceMethod` + `PluginServiceMethod` →
   `ServiceMethodFn`, independently.
4. `FieldTypeDescriptor` → `FieldType` + `FieldType` → `FieldTypeName` + add
   `defineFieldType`, independently.
5. `FieldDefinition` → `Field`, `BlockDefinition` → `Block`, last: widest diff,
   no dependents.

---

# Parked questions

These need a conversation, not an implementation.

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

### C5. `dispatch` lives under `transport/mcp/` but serves three transports

`buildDispatch` and `buildScopedDispatch` are exported from `astromech/methods`
and used by the CLI, the MCP server and the in-process tool loop, but live in
`transport/mcp/dispatch.ts` — a shared thing filed under one of its consumers.

Move to `transport/dispatch.ts`, or to `policies/` — which is now a more
coherent home than it was, since `with-permissions.ts` left for `permissions/`.
Worth a `decisions/` line: it interacts with the parked `guards/` question below.

### C6. `manifest-registry.ts` is in `codegen/` but isn't codegen

`codegen/` holds `type-generator.ts`, `method-manifest.ts`,
`plugin-client-manifest.ts` (all generators) and `manifest-registry.ts`, which
`ARCHITECTURE.md:95` describes as "the boot-generated copy" read at runtime.
`getMethodManifest` is public and resolves here.

Either move it to `boot/` or accept it and say so in the file header.
Small, but it sends people grepping the wrong directory.

---

**Parked:** renaming `policies/` → `guards/`. The code reaches for "guard"
already (`permissions-for.ts` "a permission guard", `scoped-services.ts` "the
single enforcement seam", both "fails CLOSED"), and NestJS/Angular/Vue Router all
use it for this. Against: `method-filter` is a filter and `confirmation` is a
brake, so it fits some of the directory and not all of it, and it swaps one
imperfect umbrella for another. The directory is now smaller — four files, since
`with-permissions.ts` moved out — which makes the question easier than it was.
Revisit once `ai-integration` lands and the directory's real job is settled.
Write it up in `decisions/` either way.
