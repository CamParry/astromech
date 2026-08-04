# 0018 — a `defineX` returns an `X`

**Date:** 2026-08-04
**Status:** accepted

§I of the naming pass, and the last of it. `Descriptor` and `Definition` stop
being suffixes: the object a factory returns takes the bare noun, and the
derived or runtime form takes the qualifier, on the prefix side, using the ones
the codebase already had — `Resolved*`, `Registered*`, `Collected*`.

## Why not "definition"

A definition implies something that carries information and no behaviour. Half
of these carried behaviour. `FieldTypeDescriptor` holds `build`, `coerce`,
`validate`, `tsType` and `children` — an object, not a description of one.
Every earlier attempt at this vocabulary reached for "definition" and then met
something that was an actual object, and broke on the same rock.

The word was never the problem. Suffixing was.

## Why the bare noun was available

Two incumbents held names they had the weaker claim to.

`FieldType` was a union of string literals. `'text'` is the _name_ of a field
type, not the field type; the record saying how it builds, coerces and validates
is. It became `FieldTypeName`, which is more accurate than what it was called
before. The rename was done name-first, then object-second, so the two never
briefly collapsed into one type.

`EntryTypeConfig` forced a double qualifier at every derived site:
`ResolvedEntryTypeConfig` is `Resolved` + `EntryType` + `Config`. It became
`ResolvedEntryType`, and `AdminEntryTypeConfig` became `AdminEntryType` — which
also made `resolveAdminEntryType()` return an `AdminEntryType`.

The qualifying convention on the other side was already in place and well
populated: `ResolvedConfig`, `ResolvedEntryFields`, `ResolvedPluginIdentity`,
`ResolvedAdminPage`, `RegisteredHook`, `RegisteredRawRoute`,
`CollectedPluginTable`. `DefinedHook` existed because the codebase needed this
distinction, had no convention, and improvised a prefix on the wrong side.

## Ecosystem

`defineComponent` → a component. `defineStore` → a store. `defineConfig` → a
config. Drizzle's `pgTable()` → a table object. Vue, Pinia, Vite and Drizzle all
give the bare noun to the definition.

Rejected for the table type: **`TableInterface`** (collides with the `interface`
keyword and with "interface" as an API boundary) and **`TableShape`** ("shape"
is spent on the public/full visibility axis).

## The rule found `createRegistry` on its own

`defineRegistry` returns a runtime slot with `{set, get, peek, clear}`. Nothing
is defined; a thing is created, and `createStorage` is the family it belongs to.
It was not on the original list — the rule surfaced it, which is the evidence it
has teeth.

## The service-method pair, where the plan was backwards

The plan said `ServiceMethodDescriptor` → `ServiceMethod`, and
`PluginServiceMethod` → `ServiceMethodFn`, "the callable signature". Both halves
were wrong against the code, and only reading the types showed it.

`PluginServiceMethod` is an object — `{access, handler, summary?, input?,
output?} & ServiceMethodEffect` — not a function type, and it is exactly what
`defineServiceMethod` returns. Under the rule, `ServiceMethod` is _its_ name.

`ServiceMethodDescriptor` has no handler at all. It is what a core domain
declares _about_ each of its methods — permission rule, effect flags, I/O
schemas — read by the `permissionsFor` guard and the manifest generator, while
the implementation lives on the service object.

It became **`ServiceMethodContract`**, after ts-rest, whose `contract` is this
exact thing: a per-method record of `summary`, Zod schemas and access metadata,
declared separately and implemented elsewhere via `s.router(contract, {…})`.
Astromech's core catalogues have the same shape and the same split, so the
catalogue consts went with it — `usersDescriptors` → `usersContract`, and
`EntryMethodDescriptor` → `EntryMethodContract`.

Rejected: **`ServiceMethodDeclaration`**, the same abstract suffix the rule set
out to remove, with no prior art in this neighbourhood — a synonym for
"descriptor". **`ServiceMethodMeta`** — "meta" says nothing about which
metadata, and `ToolAnnotations` already holds the metadata-about-a-callable
slot. **`ServiceOperation`** — `entries/operations/` already owns "operation"
in-domain.

## Four rows of the plan did not survive contact

The rule held everywhere it was applied. The plan's inventory of what it applied
to did not, and each of these was visible only by opening the type rather than
trusting the table.

- **`defineCommand` is not ours.** Every one in the repo is imported from
  `citty`. There was no Astromech factory to rename.
- **`definePluginTable` already returns a `Table`**, once `TableDescriptor` was
  renamed. The plan wanted a new `PluginTable`; what it returns genuinely is a
  table, with the namespaced name encoded in the type parameter, so a separate
  type would have existed only to satisfy the rule's letter. It is a deliberate
  exception, alongside `definePlugin`, which keeps returning a factory per
  `0007-plugin-core-boundary.md`.
- **`defineAdminPage` was already compliant** — `defineAdminPage(page:
AdminPage): AdminPage`.
- **`defineFieldType` should not exist.** Plugins register field types through
  `def.fields: PluginFieldTypeRegistration[]`, a different type, so `FieldType`
  is a core-internal registry entry with no authoring path. The factory would
  have had no callers, and adding it would have grown the public surface for
  nothing.

`AstromechConfig` stays: `defineConfig` → config is its own universal
convention.

## What keeps the word

**`@astromech/schema-engine`.** It never holds a `Table` — it consumes
snapshots, and "descriptor" there means the caller's source-of-truth definitions
generically. Forcing the word in would make it worse: "the chain is ALREADY at
the table state" says nothing in a package whose entire model is tables, and the
distinction being drawn is against the state the migration chain has reached.

**Two runtime strings**, in `transport/tools/dispatch.ts` and
`errors/permission.ts`. Both are asserted or user-facing output, so changing
them is a behaviour change rather than a rename — the same line this pass
already drew for the `surface` strings in `astromech methods --json`.

**Two nominal collisions**, both left. `admin/components/ui/table.tsx` exports a
compound component `Table`, and `admin/components/ui/input.tsx` imports a `Field`
from base-ui. Neither file references the type it shares a name with, no file
has both in scope, and `astromech/ui` exports neither — so the collisions cost a
reader nothing.

## `Field` beside `Entry`

`Field` (a spec) now sits beside `Entry` (a stored row) in `types/`. The pair
holds because `Entry`'s spec is `EntryType`, not `EntryDefinition`: `EntryType` /
`Entry` and `Field` / field values are the same shape. `TERMINOLOGY.md` states it
so the asymmetry reads as deliberate.

This also overturns a documented choice. `TERMINOLOGY.md` picked
`EntryTypeConfig` explicitly "to avoid ambiguity"; the ambiguity is now carried
by `ResolvedEntryType` and `AdminEntryType`, which is where it belongs — on the
derived form, not as a suffix on the authored one.

## What landed

Five commits on `refactor/definitions-are-objects`, 238 files, at an unmoved
test baseline of 2460 core / 79 authoring / 86 schema-engine throughout, with
`db:generate` reporting no changes after the `Table` rename.

- `0a1bce6` — `TableDefinition`/`FormDefinition` → `ResolvedTable`/`ResolvedForm`,
  `types/definitions.ts` → `types/resolved.ts`, `admin/definitions/` →
  `admin/rendering/`, `derive.ts` → `resolve.ts`. These were derived from
  `AdminEntryType` and were never definitions; the producing functions follow the
  existing `resolveX(): ResolvedX` convention. Rejected on the way:
  `deriveTable`, one letter from `defineTable`.
- `c70f573` — `TableDescriptor` → `Table`, `descriptor-snapshot.ts` →
  `table-snapshot.ts`, and the word off every identifier that carried it
  (`PLUGIN_DESCRIPTORS` → `PLUGIN_TABLES`, `Storage.descriptor` → `.table`, the
  codec's `desc` parameters). `decode`/`encode`/`encodePatch` take a `tableName`
  now, since `table` names the `Table`.
- `161aa3a` — the service-method pair above.
- `56ee7a7` — `FieldTypeDescriptor` → `FieldType`, `FieldType` → `FieldTypeName`,
  `FieldDefinition` → `Field`, `BlockDefinition` → `Block`,
  `MessageDescriptor` → `MessageRef` (it borrowed FormatJS's name without
  FormatJS's shape; it is `{ $t: string }`, a reference into a catalogue).
- `044a16c` — `EntryTypeConfig` → `EntryType`, `DefinedHook` → `Hook`,
  `defineRegistry` → `createRegistry`.
