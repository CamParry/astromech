# `col.reference` resolution

Split out of `storage-layer-follow-ups.md` on 2026-07-30 when the rest of that
file shipped. It is the one part with **no consumer to serve**, which is exactly
why it keeps being deferred.

Ten `col.reference` columns exist and **nothing resolves any of them**, so a
resolver today would be a feature with no reader. It was cut from the storage API
workstream for that reason, and left unbuilt by the follow-ups workstream for the
same one.

## Two constraints for whoever picks this up

- **Do not call it `populate`.** That name already means content-relationship
  population (`entries/internal/populate.ts`), which is a different mechanism over
  a table that is itself being redesigned into a derived index (see
  `in-progress/relationships-model.md`). Use `resolveRefs` / `withRefs`.
- The **cross-scope case is the actual design problem**: a plugin needs a handle
  to core's resolver while remaining unable to address core tables. "Core resolves
  it" is a policy, not a mechanism.

## Likely first consumer

Admin rendering "created by …" on an entry list. Until something like that is
actually being built, this file is a note, not a queue item.
