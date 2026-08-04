# Naming pass — what is still open

**Items 1–22 of this plan shipped on 2026-08-04** and have been removed from
this file. What landed, and where, is in `roadmap/in-progress/naming-pass.md`;
the headline decisions are `decisions/0009-service-method-client-vocabulary.md`
and `decisions/0015-public-subpaths-mirror-the-source.md`.

What remains is below: the three sections that were never in the order table (§H,
§I, §J), and four questions parked for a later conversation.

Everything here is still a rename with no behaviour change, so the same
constraint applies: land it when `roadmap/in-progress/` is quiet, because it
conflicts with anything mid-flight in the same files.

## Ordering

§I has an internal dependency: the admin `TableDefinition` must become
`ResolvedTable` before `TableDescriptor` can become `Table`. `FieldDefinition` →
`Field` goes last — widest diff, no dependents.

§H1, §I and §J each need a `TERMINOLOGY.md` entry, and §I overturns an existing
one.

---

# §H — the `fields` module

Added 2026-08-04. 20 files, 3,406 lines. Public via `astromech/fields` and
`astromech/columns`.

**Not changing: the field type names.** `fields.number`, `fields.slug`,
`column.text` are short, guessable and namespaced. `fields.text()` and
`columns.text()` are not a collision: both are always reached through their
namespace, and `columns.ts:3` says so ("Designed for namespaced use"). The
parallel naming is a feature. `block`/`blocks` and `tab`/`tabs` are not
duplicates either: `blocks(name, {blocks})` is the container, `block(type,
{fields})` returns a `BlockDefinition`, a different type.

### H1. One name for the two categories, and it isn't "chrome"

The distinction exists and is load-bearing already. It is stated three times,
with two names and three memberships:

| Site                      | Names it                                         | Members                                                           |
| ------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `types/fields.ts:4-7`     | "Layout containers" / "data containers"          | `section`/`tabs`/`tab`/`accordion` vs `group`/`repeater`/`blocks` |
| `core-descriptors.ts:4-9` | "Layout containers" / "the four data containers" | same vs `group`/`repeater`/`blocks`/`tree`                        |
| `builder.ts:6-8`          | "chrome containers"                              | `section`/`accordion`/`tab` (omits `tabs`)                        |

Three data containers in one file, four in another. `tabs` in two lists and not
the third. Neither term is in `TERMINOLOGY.md`.

**Take `layout field` and `presentational`.** Payload, the nearest neighbour,
splits the same set and calls the presentational half **Layout Fields**
(`collapsible`, `row`, `tabs`, `ui`), on the same operative rule Astromech uses:
a field with a `name` stores data, a field without one does not.

**Drop "chrome" entirely** (10 sites): `types/fields.ts:42,333,373`,
`fields/builder.ts:6`, `fields/columns.ts:3`, `kernel/config-resolver.ts:37`,
`codegen/type-generator.ts:39`, `admin/components/ui/layout.ts:3`,
`admin/components/entries/entry-fields-renderer.tsx:5`,
`admin/components/fields/form-field.tsx:74`. Two meanings, both replaceable:
"pure chrome, no stored value" means _presentational_; "page chrome, breadcrumbs,
toolbars" means _the shell_, which is the admin's own word already
(`admin/shell.astro`, the slot docs in `TERMINOLOGY.md`).

`TERMINOLOGY.md` gains one entry stating both categories and their membership
once, and the three docstrings point at it instead of restating it.

### H2. Retire "container" as the category word

"Container" is a visual box everywhere else: Bootstrap `.container`, Tailwind's
`container`, CSS container queries, Filament. "Data container" therefore reads
backwards, because the data containers are the ones that may draw no box
(`group({container: false})`) while the layout ones are the boxes.

The other four need no category name. They are fields whose name is a data key,
which is every other field. Where prose needs the distinction, **nested field**
carries it.

### H3. `isLayout` is dead and `isContainer` is redundant

`types/fields.ts:287` declares `isLayout?: boolean` on `FieldTypeDescriptor`.
One occurrence in the repo: the declaration. Never set, never read. It is dead by
construction, because layout fields have no descriptor at all
(`core-descriptors.ts:4-6` excludes them).

Its siblings are live: `isContainer` is read at `codegen/type-generator.ts:165`
and `fields/pipeline.ts:326`; `isRelation` at `relationship-edges.ts:76,179`.

But `isContainer` is set on exactly the four types that fill the `children` slot
(`core-descriptors.ts:299,323,338,356`), so `descriptor.children !== undefined`
already answers it. Delete both flags; keep `children`, which names the concept
by existing.

### H4. `FieldDefinition.container` → `boxed`

`types/fields.ts:334`, a `group`-only option. Its docstring says what it actually
controls:

> `group` only. When `false` the group becomes invisible chrome: box AND label
> are dropped and the sub-fields render inline, keeping only the nested data key.

Nothing to do with containment: it decides whether a box is drawn. `boxed`
(default `true`) says it. Frees "container" per H2.

### H5. `formatFieldPath` → `formatInstancePath`

The sharpest single rename in the module. `field-path.ts` defines two rendered
forms and names them correctly in prose (`:123` "Render segments as an instance
path", `:159` "Parse an instance path back into segments"). `TERMINOLOGY.md`
defines the same pair. The `relationships` table has an `instancePath` column.
`relationship-edges.ts:40-42` types both as `schemaPath` / `instancePath`.

Then:

```ts
export function formatSchemaPath(...)   // correct
export function formatFieldPath(...)    // this is the instance path
export function parseFieldPath(...)     // parses an instance path
```

`relationship-edges.ts:79` reads `const instancePath = formatFieldPath(segments)`
— a correctly-named variable assigned from an incorrectly-named function.

`formatFieldPath` → `formatInstancePath`, `parseFieldPath` → `parseInstancePath`.
The file keeps its name: it holds the grammar for both forms plus
`isValidFieldName`.

### H6. Split `helpers.ts`

Its header is a changelog, not a description:

```
Field system helpers — merged from:
  - src/utilities/field-helpers.ts  (fieldNameToLabel, getFieldLabel)
  - src/utilities/entry-fields.ts   (flattenFieldNodes, flattenEntryFields)
  - src/utilities/field-count.ts    (CountRange, CountStatus, lengthStatus)
```

Three unrelated concerns under a name that describes none of them, and the file
still remembers being three files. Split to `flatten.ts` and `count.ts`; the
label pair merges into the existing `utilities/labels.ts` rather than claiming a
second `labels.ts`.

Inside: `CountRange`/`CountStatus` sit beside `lengthStatus`, two words for one
concept. `count` matches the public `TextOptions.count`, so `lengthStatus` →
`countStatus`.

### H7. `scoped-reads.ts` → `field-reads.ts`

"Scoped" already means three things here: permission-scoped
(`policies/scoped-service.ts`), plugin-scoped (`ctx.storage`) and request-scoped
(`context/`). This is none of them. It is a lazy record loader the pipeline uses
for async checks, and `pipeline.ts:3-4` describes the handle as "the injection
point for any async checks (uniqueness, references)".

`ScopedReads` → `FieldReads`, `scopedReadsFromRecords` → `fieldReadsFromRecords`.

`valuesEqual` in the same file is general structural equality, exported from
`astromech/fields` and unrelated to reads. Move to `utilities/`.

### H8. `patch.ts` holds something that isn't patching

`mergePatch` fits the file. `projectToSchema` does not: projecting a value onto a
schema is not a root-level patch operation. Either move it or widen the filename.
Small, but it makes `projectToSchema` unfindable.

### H9. `columns` goes plural everywhere

`columns.ts`, `astromech/columns`, and the header's recommended alias
`import * as column` all disagree today. Plural everywhere, matching `fields`.
The alias is what appears in every user's config, so the docs move with it.

### H10. Recorded, not fixed: `tabs()` takes no name

Every factory is `type(name, options?)`. `builder.ts:215-217` is the exception:

```ts
export function tabs(options: TabsOptions): FieldDefinition {
    return { name: 'tabs', type: 'tabs', fields: options.fields };
}
```

Two `tabs()` in one entry type produce two fields both named `tabs`. Harmless
while the name is inert, and a latent duplicate-key bug the moment anything keys
off it. Noted here because it is also the accidental prototype for the deferred
question below.

### Deferred: layout fields taking a name, and `group` vs `section`

**Reversed on 2026-08-04.** An earlier draft of this section proposed _dropping_
the name parameter from `section`/`accordion`/`tab` so the signature would signal
"takes a name ⇒ makes a data key". The intended direction is the opposite: layout
fields should optionally accept a name that groups their content.

That makes `section` and `group` differ only by whether a name was passed, which
is most of the way to collapsing them into one type with two toggles (does the
name nest child keys; is a box drawn). `group({container: false})` already
occupies one of the four corners of that 2×2, so the toggles are real rather than
hypothetical.

Not designed here. It is a behaviour change with a stored-data migration, not a
rename, and it needs its own session. H4's `boxed` rename is compatible with it
either way.

---

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

**§H3.** `FieldTypeDescriptor` → `FieldType` throughout, and
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

# §J — a superordinate noun for entries, media, users and settings

Added 2026-08-04. Blocks the validator naming in §H's neighbourhood.

There is no word for "an entry, a media item, a user, or a settings page" — the
four things that carry fields, run the field pipeline, and can hold a validator.
There are, however, **two names for three of them**:

```ts
// types/domain.ts:63
/** What can hold, or be pointed at by, a relation. */
export type ResourceType = 'entry' | 'user' | 'media';

// fields/relationship-edges.ts:35
export type TargetKind = 'entry' | 'user' | 'media';
```

Identical unions, duplicated deliberately (`types/api.ts:127`: a pure leaf may
not import a capability). The DB columns are `sourceKind` / `targetKind`. So the
codebase already says both **resource** and **kind** for the same set.

**Take `resource`.** Already present in `types/domain.ts`, REST vocabulary every
web developer holds, no collision here, and it extends to a settings page.
`record` stays too database-flavoured given `TERMINOLOGY.md` already refused it
for entries; `document` collides with ProseMirror docs in `fields/rich-text/`.

- `ResourceType` gains `'setting'`.
- `TargetKind` keeps a separate name — once settings joins, the two sets differ:
  everything is a resource, but only entries, users and media can be pointed at
  by a relation. It earns its own type, not its own vocabulary. Reword its
  docstring to say "the relation-eligible subset of `ResourceType`".
- `TERMINOLOGY.md` gains the entry.

## Consequence: the document validator names itself

`fields/document-validators.ts` exports `setDocumentValidator`,
`getDocumentValidator`, `resetDocumentValidators`, `registerDocumentValidators`,
plus `DocumentValidator`, `DocumentValidationContext`,
`DocumentValidationResult`.

"Document" is undefined vocabulary and reads as a ProseMirror doc first, in a
module that has `docToMarkdown` / `markdownToDoc` two directories over.
`TERMINOLOGY.md` bans "record" for entries and says nothing about "document",
which has the same problem plus a live homonym.

With §J landed these become **resource validators**:
`setResourceValidator`, `ResourceValidationContext`, `fields/resource-validators.ts`.
The name then explains the key space it already has (`entry:<type>`, `media`,
`users`, `setting:<page path>`) instead of contradicting it.

_Rejected: "cross-field validation" — describes a technique rather than naming
the thing, and reads broader than it is._

---

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
