# `col.reference` resolution

Split out of `storage-layer-follow-ups.md` on 2026-07-30 when the rest of that
file shipped. It is the one part with **no consumer to serve**, which is exactly
why it keeps being deferred.

Ten `col.reference` columns exist and **nothing resolves any of them**, so a
resolver today would be a feature with no reader. It was cut from the
`completed/data-layer-storage-api.md` workstream for that reason, and left
unbuilt by the follow-ups workstream for the same one.

## Two constraints for whoever picks this up

- **Still do not call it `populate`, but the reason changed.** The collision is
  gone — `entries/internal/populate.ts` was deleted by
  `completed/relationships-model.md`, which made field data the source of truth
  and left nothing to populate _from_. What remains is that the word now means
  something specific and negative here: a **populated record** is the shape
  `relationship`/`media` validation _rejects_ (see `TERMINOLOGY.md`). Reusing it
  for a working feature would teach the opposite of what the error message says.
  Use `resolveRefs` / `withRefs`.
- The **cross-scope case is the actual design problem**: a plugin needs a handle
  to core's resolver while remaining unable to address core tables. "Core resolves
  it" is a policy, not a mechanism.

## Likely first consumer

Admin rendering "created by …" on an entry list. Until something like that is
actually being built, this file is a note, not a queue item.
