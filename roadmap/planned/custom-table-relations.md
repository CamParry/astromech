# Custom-Table Relations

An entry type with a custom table (`tableRepository`) takes part in the
relationships index, but not symmetrically. This file reviews what works, what
is refused, and where the code and the docs disagree, then decides whether the
refusals should become support, clearer errors, or documented limits. It is a
review, not a built design: the output is a decision and, where a change is
warranted, its own roadmap file.

## What works today

- **As a source.** A custom-table entry's outgoing edges (its relationship
  fields) are indexed on write and rebuilt by `index:rebuild`
  (`customTableEntrySources`, `entries/internal/relationships.ts`). Reverse
  lookups and `references` filters against _other_ types find it.
- **As a target, for reverse lookup.** `incomingRelationships` and the
  `references` filter locate rows pointing _at_ a custom-table type; the index
  is polymorphic across entries, users and media, so the target's kind does not
  matter.
- **As a target, for dangling-id pruning.** `tableRepository` implements
  `existingIds` (`entries/repository/table.ts`), so `dangling-relations.ts`
  checks a custom-table target against its own table and prunes a genuinely
  dead id.

## What is refused

- **Querying a custom-table type with `where: { references }`.** The type's own
  `list` runs against an arbitrary table and cannot compile the `EXISTS`
  subquery that joins it to the relationships index, so the filter throws
  `RelationshipFilterUnsupportedError` (`entries/repository/table.ts`,
  `entries/errors.ts`) rather than return unfiltered rows. Documented at
  `apps/docs/content/relationships.md`.

## Open questions

1. **Should the `references` filter be supported for custom-table types?** The
   index already holds the edges; the missing piece is compiling the subquery
   against a table whose primary-key column is configurable. Decide whether that
   is worth building, or whether a refused filter is the right permanent
   boundary.
2. **Reconcile the pruning docs with the code.** The "Deleted targets" section
   of `apps/docs/content/relationships.md` says ids pointing at a custom-table
   target are never pruned and accumulate until `index:rebuild`. The code prunes
   them through the repository's `existingIds`. One of the two is wrong;
   establish which and fix the loser. If the code is right, this is a plain doc
   fix, not a design question.
3. **Is the refusal error clear enough?** If the filter stays refused, the
   message (`RelationshipFilterUnsupportedError`, `entries/errors.ts`) should
   tell a plugin author what to do instead of only naming the constraint.

## Output

A `DECISIONS.md` entry for each of the three questions, the doc fix for question
2, and, only if question 1 lands on "support it", a separate roadmap file for
that build.
