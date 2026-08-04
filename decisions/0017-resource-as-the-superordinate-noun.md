# 0017 — `resource` as the superordinate noun

**Date:** 2026-08-04
**Status:** accepted

§J of the naming pass. Four things carry fields, run the field pipeline and can
hold a whole-object `validate` — an entry, a media item, a user, a settings page
— and there was no word for the set. There were two words for a subset of it,
and an anonymous union for the set itself.

## The set had two names and no name

`types/domain.ts` declared `ResourceType = 'entry' | 'user' | 'media'`.
`fields/relationship-edges.ts` declared `TargetKind` with the same three
members. The `relationships` table has `sourceKind` and `targetKind` columns,
each with its own `col.enum(['entry','user','media'])`. So the codebase said
both **resource** and **kind** for three of the four, and said nothing at all
about the fourth.

The duplication between the two types was deliberate and documented — a pure
leaf may not import a capability — but the reader arriving at either one has no
way to know that, or which is the live one.

Neither was the real consumer. `types/fields.ts` wrote the union out by hand,
twice, on `FieldValidationContext.host.kind` and
`DocumentValidationContext.host.kind`, and both copies already included
`'setting'`. That inline literal was the concept: the pipeline is host-generic
and had been carrying the four-member set since the day it was made so.

**`ResourceType` had zero use sites repo-wide** while being publicly exported.
That is the evidence the vocabulary was missing rather than merely misspelled —
a named type nothing reaches for, sitting beside an anonymous one written twice.
Adding `'setting'` to it without wiring it into `types/fields.ts` would have
left both facts true.

## Why `resource`

It is already in `types/domain.ts`, so nothing is coined. It is REST vocabulary
every web developer holds, and it means roughly this — an addressable thing the
API operates on. Nothing else in Astromech claims it. And it extends to a
settings page, which is the member that broke the alternatives: a settings page
is not a row, and calling it one would be worse than having no word.

**Rejected: `record`.** Too database-flavoured, and `TERMINOLOGY.md` already
refuses it for entries on exactly that ground — "it conflates CMS content with
raw database rows". Adopting it one level up would have contradicted a term the
project already decided.

**Rejected: `document`.** It collides with a live homonym in the same package:
`fields/rich-text/` has `docToMarkdown` and `markdownToDoc`, where a doc is a
ProseMirror document. It was also the incumbent for the validators, and the
collision is why they moved.

## `TargetKind` survives

Once `'setting'` joins `ResourceType` the two sets genuinely differ: everything
is a resource, but only entries, users and media can be pointed at by a
relation. `TargetKind` earns its own type, not its own vocabulary — its
docstring now says it is the relation-eligible subset, so the next reader
understands why two similar unions coexist instead of assuming one is stale.

Its membership did not change, which is what kept this a rename. The exhaustive
`switch` in `database/storage/resource-existence.ts` still covers it.

## The document validators became resource validators

`fields/document-validators.ts` is `fields/resource-validators.ts`; the four
registry functions and the three public types follow —
`ResourceValidator`, `ResourceValidationContext`, `ResourceValidationResult`.
The three types are on the root `astromech` export, which is acceptable pre-1.0.

"Document" was undefined vocabulary, read as a ProseMirror doc first, and
contradicted the key space the registry already had. The keys are
`entry:<type>`, `entry:<plugin>/<type>`, `media`, `users` and
`setting:<page path>` — a list of resources. The name now explains them.

**Rejected: "cross-field validation".** It describes a technique rather than
naming the thing, and reads broader than it is — a field's own `custom` rule can
read siblings too, so the phrase does not pick out the validator that runs once
over the whole resource.

## Two duplications that stay

**`MediaUsage.sourceKind`** (`types/services.ts`) keeps its hand-written
three-member copy. Its own comment gives the reason: it is a pure leaf and may
not import a capability, so it cannot reference `TargetKind`. This is a
structural consequence of the layer model rather than an oversight, and it is
the third copy of the union in the codebase.

**The `col.enum` literals** on `relationships.sourceKind` and
`relationships.targetKind` (`database/schema.ts`). A column descriptor infers
its own literal union from the array it is given, with no link to either named
type, and changing that array would mean a migration. This pass involved no
migration.

## One inconsistency recorded, not fixed

The validator keys say `media` singular and `users` plural. They are runtime
keys — boot writes them and six call sites read them — so changing them is a
behaviour change, not a rename, and it is out of scope for a naming pass. It is
recorded here so the next reader knows it is known.

## "Document" is gone entirely, including the prose

`ctx.documentValidate` on the field pipeline is `ctx.resourceValidate`. It is a
`FieldPipelineContext` property with call sites in six services and assertions
in the pipeline tests — 32 sites, all inside `packages/astromech`. Nothing in
`apps/docs`, `apps/demo` or `packages/plugins` names it.

Leaving it would have left `documentValidate?: ResourceValidator` on one line,
which is the half-rename this record exists to avoid. The argument against
"document" — undefined vocabulary that reads as a ProseMirror doc first — does
not weaken when the word appears in a property name instead of a type name.

The prose followed for the same reason. `apps/docs/content/field-validation.md`
had a `## Whole-document validation` heading and described "the document-level
`validate`"; both now say resource. A reader who meets `resourceValidate` in a
stack trace and `## Whole-document validation` in the guide has to work out that
they are the same feature.

**The authored config key is untouched.** An author still writes plain
`validate` on an entry type, on `media`, on `users` or on a settings page. This
pass renamed no config key and no wire field: `details.form` still carries the
form-level message, because that is a wire shape rather than vocabulary.

What survives the rename is "document" where it means a ProseMirror document —
`docToMarkdown`, `markdownToDoc`, and the `richtext` row in the docs' rule
table. That was always the word's real owner here, which is the whole reason it
could not also mean this.
