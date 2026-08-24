# Profile Entry Type

Editorial identity as a first-party **entry type** that relates to a user, rather than fields bolted
onto `users`. Split out of `completed/relationships-model.md`, which unblocked it rather than
contained it.

**Status:** not started. The model is already decided —
`DECISIONS.md` §"Editorial identity lives on a profile entry,
not on `users`". This file holds the build shape and the questions still open.

## Why an entry, not user fields

Users stay purely functional (auth). Editorial data lives on a `profile` / `author` entry, so
translation, versioning, publishing and permissions all happen at the content layer where they
already work — none of which `users` has.

**The link lives on the profile (`profile.user`), never on `users`.** An admin may have no profile
and a guest author may have no account, so both directions must tolerate absence, and `users` is
untouched either way. "The profile for this user" is a reverse read against the relationships index —
exactly the query `where: { references: { path: 'user', id } }` already answers.

`createdBy` (which account wrote the row) and the byline (which profile gets credit) are different
fields and must not be conflated — they are frequently different people. `createdBy` records who did
it; it is not a claim of ownership, so deleting a user must never force content reassignment the way
WordPress does.

## What this needs

- [ ] **The entry type itself**, first-party, with the `user` relationship field.
- [ ] **Row-level permissions.** The shape this needs is "a user may edit the profile entry that
      points at them, and no other". Nothing in the permission model expresses a per-row rule today —
      it is action-and-type scoped. This is the substantial piece and is worth designing before the
      entry type is written, because it is the part that generalises.
- [ ] **One-user-one-profile.** A write-time validation that reads the relationships index, never a
      DB constraint on it. The index is derived and rebuildable, so a uniqueness constraint there
      would be enforcing a content rule in a cache.

## Open questions

- **Is a profile required to publish?** If a byline is mandatory, an entry type with no profile
  relationship cannot publish, which is a config-level rule the entry pipeline has no vocabulary for.
- **What happens to the byline when a profile is trashed or deleted?** The relationships model
  deliberately never cascades and never blocks a delete, so the reference dangles until the
  referencing entry is next written. For a byline that means an entry silently loses its author,
  which may want a different answer from the one the general model gives.
- **Does the profile own the avatar, or does `users`?** Both can hold a media relation. Two places to
  change one picture is the kind of split that ages badly.
- **Naming: `profile` or `author`?** `author` reads better on a byline and worse on a contributor who
  has never written anything.

## Unblocks

**Owning the `users` table** instead of better-auth owning it — see `backlog.md`. It was blocked on
needing to add editorial columns to `users`; the profile model removes that reason entirely, so this
becomes a decision about migration control rather than about schema.
