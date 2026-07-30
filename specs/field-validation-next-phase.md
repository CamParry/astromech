# Field Validation — Next Phase (design state)

In-flight design notes for the work remaining after the P0–P5 headline
(server-side field validation) shipped and merged to `main` on 2026-07-28. The
P0–P5 design spec it accompanied has been deleted, as planned. This spec covers
what's left: nested validation, a few pipeline add-ons, and the entry-create bugs
surfaced alongside the validation work.

Status legend: ✅ done (committed) · 🟡 done but uncommitted · ⬜ not started ·
❓ design decision open.

## 0. Where the branch is

Shipped + committed on the branch:

- P0–P5 (contract → descriptor registry → pipeline → wire entries/media/users/settings → admin error surfacing, incl. P5a/P5b admin normalization).
- `refactor(fields): single source for reserved instance keys` (`fields/reserved-keys.ts` — `RESERVED_KEY` / `RESERVED_KEY_META` / `PUBLIC_STRIPPED_KEYS`; codegen + `entries/visibility.ts` both derive public-read visibility from it so they can't drift).

Not yet merged to `main`; awaits the user's browser-verification + merge.

## 1. The shape of the remaining work

These are NOT peers — there's a spine:

- **Nested / container validation is foundational.** ✅ Done — `processFields` now
  recurses. Everything below is easier as a result: the pipeline is already open, and
  `FieldPathSegment` gives severity and document-level errors a path model to key on.
- **Severity** and **document-level `validate`** are small additions _to the pipeline_ —
  natural to fold in while it's already open for nesting.
- **Client-side declarative-rule mirror** is a separate axis (UX/perf: run the
  declarative rules in the browser pre-submit). Independent of nesting; can come last.
- **JSON-indexed uniqueness** is a pure optimization of the existing in-memory
  `isUnique` scan. Orthogonal, low priority.

## 2. Nested / container validation — ✅ SHIPPED 2026-07-30

Built on `feat/nested-field-validation`, merged to `main`. The design notes below are
kept only as the record of what was decided; the implementation is the authority now
(`packages/astromech/src/fields/field-path.ts`, `pipeline.ts`, `core-descriptors.ts`).

**The "coupled to the relationships work" framing was wrong** and cost a round of
analysis — worth recording. `_id` was already persisted client-side for
repeater/blocks/tree, and `tree-field.tsx` already emitted `nav[<uuid>].label`. The
only real coupling was the path grammar itself, shared with the relationships derived
index (which keys on field path). That was resolved by owning the grammar here as one
module serving both: `formatFieldPath` for instance paths, `formatSchemaPath` for the
index. Nothing else was blocked.

**What shipped, beyond the notes below:** brackets not dots (`blocks[<id>].heading` —
dots read as keyed-object access, the wrong mental model, and brackets need no
"field names can't start with `_`" rule); `_children` is never a segment, so paths
chain through declared fields only and one rule covers all four containers;
descriptor-driven recursion via a `children(field, value)` slot rather than a type
switch; server-side `_id` minting; item-count `min`/`max`; an error on an undeclared
block `_type`; and `isValidFieldName`, because the grammar reserves `.`/`[`/`]` in a
field name and the forms plugin takes names from untrusted JSON.

### Original design notes (superseded by the implementation)

`processFields` must recurse into container instances, applying each child field's
descriptor + declarative rules. Coupled to
`roadmap/planned/relationships-model.md` (the `_id`/identity
model): item storage there is **arrays of objects, each with a persisted `_id` UUID**;
its unstarted foundation item is "stable `_id`-based paths for nested-field keys."

**DECISION (locked): nested-error addressing is `_id`-based, not index-based.**

- Errors key by the persisted `_id`, e.g. `blocks._abc123.heading` (and `seo.title`
  for groups), NOT `blocks[2].heading`.
- Rationale: `_id` is reorder-stable (an index shifts between form load and save),
  and it reuses the path scheme the populate feature already chose — one scheme
  across both efforts, not two.
- Wire format stays the flat `422 details.fields` `Record<string, string[]>`; nested
  paths are just dotted/`_id`-segmented keys within it.
- Admin: `FieldPathProvider` already yields dotted paths for groups; repeater/blocks/
  tree renderers must key their per-item field paths by `_id` so `useFieldError(path)`
  resolves. (Confirm against the `_id`-path work in the populate feature before building.)

**Still open:** exact path grammar (separator choice, how `_id` segments are
distinguished from field names); how the pipeline walks descriptors recursively given
the locked pure `tsType`/validator signatures; coordination point with the populate
feature's migration.

## 3. Severity (error / warning) — ⬜ ❓

Sanity-style: rules/validators can flag a non-blocking **warning** vs a blocking
**error**. Open: where severity is declared (per `ValidationRule`? validator return
shape?), how it rides the wire (the channel is currently errors-only), and how the
admin renders warnings distinctly from errors. Small once the pipeline is open.

## 4. Document-level `validate` hook — ⬜ ❓

A whole-document validator (cross-field rules that no single field owns). Open: API
surface (config hook? per-entry-type?), how its errors map onto the flat field
channel (a document-level / form-level error bucket vs attaching to a field).

## 5. Client-side declarative-rule mirror — ⬜

Run the _declarative_ rules (min/max/length/pattern/email/url/enum/required) in the
browser before submit for instant feedback; the server stays authoritative. The
async/`custom`/`unique` rules remain server-only. Open: how to share one rule runner
across server + browser without dragging server-only deps into the bundle.

## 6. JSON-indexed uniqueness — ⬜

Replace the in-memory `isUnique` scan (`entries/reads.ts`) with an indexed lookup.
Pure optimization; lowest priority. Needs a JSON-index strategy decision.

## 7. Entry-create bugs (folded into this branch by user request)

These are entry-create correctness bugs, not field validation, but the user chose to
fix them on this branch since they kept getting in the way.

### 7.1 Atomic create + relationships — 🟡 done, UNCOMMITTED

`entries.create` persisted the entry row and its relationships in two separate ops; if
`saveRelationships` threw, the entry was committed orphaned. (Update was already
atomic via `runBulk` → `storage.transaction`.) **Fix:** wrap the entry-create +
`saveRelationships` in `storage.transaction` (with a non-transactional fallback),
keeping `beforeCreate` before and `afterCreate` after the transaction.

- Working-tree changes (uncommitted): `entries/service.ts` (the fix);
  `tests/services/entries/create-atomicity.test.ts` (new rollback test);
  `tests/_support/harness.ts` (test DB switched from `:memory:` to a per-worker temp
  file — libsql's `client.transaction()` nulls the in-memory db handle, so `:memory:`
  becomes a blank DB after the first transaction; a file path reconnects).
- Gate per the implementing agent: typecheck/lint/test all pass (895 tests / 70 files).
  **Re-run the gate before committing** (agents misreport gates).

### 7.2 Translatable propagation on create — ⬜ ❓ DECISION OPEN

Non-translatable (group-shared) fields are not synced when creating a translation that
joins an existing locale group. The update path _pushes_ non-translatable values to
siblings (`storage.translatable.propagateFields`); create does neither push nor pull.

Two create-a-translation flows exist:

- **"Translate"** → `entries.duplicate` with the source `localeGroup`: copies ALL
  source fields (incl. non-translatable) → already consistent.
- **"Blank in group"** → `entries.create` with `localeGroup`: form starts EMPTY.

The risk: naively mirroring update's _push_ on create would, in the blank-in-group
flow, overwrite the group's shared non-translatable values with blanks.

Options (decision needed before building):

1. **Inherit from siblings (recommended).** On create into an existing group,
   backfill non-translatable fields from a sibling, overriding the form's values for
   those keys. Always consistent, never destructive; ignores user-typed values in
   non-translatable fields on the new-translation form (acceptable — those fields are
   group-owned).
2. **Propagate to siblings (mirror update).** Push the create's non-translatable
   values out. Matches update exactly but wipes shared values on the blank flow unless
   the new-translation form is changed to pre-fill them.
3. **Smart merge.** Inherit when blank/absent, push when explicitly set. Most
   complete; fuzziest (empty-string vs undefined detection) and most to test.

## 8. After this phase

- Tick items in `roadmap/in-progress/field-validation-and-normalization.md`.
- On full verification of the remaining work: move the roadmap file to
  `completed/` and DELETE this spec — specs are ephemeral.
