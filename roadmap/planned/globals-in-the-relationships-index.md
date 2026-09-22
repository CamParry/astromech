# Globals in the relationships index

The relationships index has no global source. `sourceKind` is
`col.enum(['entry', 'user', 'media'])` (`database/tables.ts`), globals bind no
`createContentRelationships`, and `globals/internal/stored-fields.ts` never calls
`pruneDanglingRelations`. So `media.usedBy` never reports a global (deleting
seo's default OG image gives no warning), and dead ids in globals are never
pruned. `DECISIONS.md` does not record leaving globals out as a choice.

The reverse lookup for entries has the matching gap: `incomingRelationships`
keeps only `sourceKind === 'entry'`, so a user or media item that references an
entry is missing from the delete check.

## The work

- [ ] Add a `'global'` source kind, bind `globals/internal/relationships.ts`,
      and prune dangling references on the globals write path.
- [ ] Move `pruneDanglingRelations` from `entries/internal/` to `content/`;
      users and media already import it across module boundaries.
- [ ] One shared source-title loader in `content/` for every source kind, with
      batched reads per type, used by both reverse lookups.
