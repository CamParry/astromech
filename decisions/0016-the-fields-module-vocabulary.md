# 0016 — The `fields` module's vocabulary

**Date:** 2026-08-04
**Status:** accepted

§H of the naming pass, and the last of it that is a rename rather than a
question. Twenty files, and the one distinction the whole module turns on had
two names and three memberships.

## Layout field, and presentational

Every field type falls on one side of a single rule: a field whose `name` is a
data key stores data, a field whose name is inert does not. That rule was
already load-bearing — it decides whether a type gets a descriptor, whether the
codegen emits a property for it, and whether its name can appear in a field
path. It was stated three times and never the same way twice:
`types/fields.ts` called the halves "layout containers" and "data containers"
and listed three of the latter; `core-descriptors.ts` used the same two names
and listed four; `builder.ts` said "chrome containers" and listed three of the
former, omitting `tabs`.

**The presentational half is now four layout fields — `section`, `tabs`, `tab`,
`accordion` — and the membership is stated once, in `TERMINOLOGY.md`.** Payload
is the precedent: it splits the same set on the same rule and calls its half
Layout Fields. Reaching for the neighbour's word costs a reader nothing to
learn.

**"Chrome" is gone.** It carried two meanings in one codebase. "Pure chrome, no
stored value" is _presentational_, which is now the adjective. "Page chrome,
breadcrumbs, toolbars" is the admin **shell**, which this codebase already has a
better word for — `admin/shell.astro`, and the admin slots that mount into it.
A word that means two things in ten sites is worse than either of the two words
that replace it.

## Why "container" was retired as the category word

A container is a visual box everywhere else in web: Bootstrap's `.container`,
Tailwind's `container`, CSS container queries. Under that reading "data
container" is backwards, because the data containers are precisely the ones that
may draw no box — `group({ boxed: false })` renders its children inline with no
box and no label — while the layout ones exist to be boxes.

The four data-bearing ones need no category name of their own. They are fields
whose name is a data key, which is every other field; what is distinctive is
that they nest. **Nested field** carries that where prose needs it, and it is
what `TERMINOLOGY.md` now says.

## Why the two flags could be deleted

`FieldTypeDescriptor` carried `isLayout`, `isContainer` and `isRelation`. Two of
the three are gone.

`isLayout` had exactly one occurrence in the repo: its own declaration. It was
dead by construction rather than by neglect — layout fields have no descriptor
at all, so there was never an object on which to set it.

`isContainer` was set on exactly the four types that fill the `children` slot,
and in every case on the line immediately above it. A flag whose truth condition
is "the field next to me exists" is not a fact, it is a restatement, and it can
drift. `descriptor.children !== undefined` answers it exactly, and `children`
names the concept by existing. Both readers — the type generator's recursion
branch and the pipeline's item-count check — now ask that.

`isRelation` stays. It is read by `relationship-edges.ts` and no other field of
the descriptor implies it.

## `boxed`

`FieldDefinition.container` was a `group`-only option whose own docstring said
it decides whether a box and a label are drawn. That is not containment, and
holding the word "container" for it was what made the category word unavailable.

It is `boxed` now, default `true`, same polarity. The admin had already reached
the same word without being asked: the component the option drives sets
`am-group-field--boxed`.

## `formatInstancePath`

The sharpest one, because nothing had to be invented. `field-path.ts` defines
two rendered forms and describes them correctly in its own prose — "Render
segments as an instance path", "Parse an instance path back into segments".
`TERMINOLOGY.md` defines the same pair under Relation vs Relationship. The
`relationships` table has an `instancePath` column. `relationship-edges.ts` types
both forms.

Only the function names disagreed, and `relationship-edges.ts:79` showed it in
one line: `const instancePath = formatFieldPath(segments)` — a correctly-named
variable assigned from an incorrectly-named function. `formatFieldPath` →
`formatInstancePath`, `parseFieldPath` → `parseInstancePath`, alongside the
`formatSchemaPath` that was right all along. The file keeps the name
`field-path.ts`, because it holds the grammar for both forms plus
`isValidFieldName`.

## What this does not decide

Whether layout fields should optionally take a name that groups their content,
and whether `section` and `group` then collapse into one type with two toggles.
That is a behaviour change with a stored-data migration, not a rename, and it is
tracked in `roadmap/planned/named-layout-fields.md`.

`boxed` is compatible with it either way: one of the two toggles that question
proposes is exactly "is a box drawn", so the rename either survives unchanged or
becomes one axis of the merged type. Nothing here forecloses it.
