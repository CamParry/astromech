# 0006 — `media:update` split out of `media:upload`

**Date:** 2026-08-03
**Status:** accepted

Editing a media item's alt text, title or caption needed `media:upload` until
now. The grouping was deliberate, not an oversight — `CORE_PERMISSIONS` said so
out loud: _"Upload new files and update existing media metadata."_ This record
exists because the reason it stopped holding is not visible from the admin UI,
which is where someone re-litigating it would look first.

## What changed under it

The method manifest. `mediaDescriptors.update` declares its permission, and
since the P0/P1 manifest work that declaration is **published** — the manifest,
the CLI and the MCP tool list all advertise a tool named `media.update` whose
stated permission was `media:upload`. A tool that names one action and demands
the permission for another is the exact drift P0 was built to remove; it was a
private implementation detail before and became an API surface without anyone
revisiting the grouping.

Two supporting reasons, neither sufficient alone:

- `users` already splits `read`/`create`/`update`/`delete`. Media read/upload/
  delete with the update folded into upload was the only domain doing this.
- `mediaApi.replace` still needs a permission assigned (it has no descriptor at
  all — see `roadmap/backlog.md`). `replace` genuinely _is_ an upload, so the
  split gives it an obvious home. Left conflated, assigning it would have
  deepened the problem.

## The alternative, and why it lost

**Keep the grouping and fix the descriptor's wording** so the manifest stops
mis-stating itself. This was real and cheaper: one string, no new key, and the
permission catalogue stays short — which is part of how it stays legible.

It lost because it fixes the symptom at the surface that reports the problem
while leaving the thing being reported. The manifest would have described the
grouping accurately; a caller holding "may add files to the library" would still
silently also hold "may rewrite the metadata on every existing file". The
honest description of that grouping is not one anyone would design on purpose.

The case for it is worth preserving, though: "can caption but cannot upload" may
be a user nobody has. If custom roles never distinguish these in practice, this
record is the argument for merging them back — and the merge would be safe,
since `media:upload` is the superset name.

## Blast radius

Nil, in practice. Both built-in roles keep what they had: `editor` gains
`media:update` explicitly, `admin` holds `*`. The demo's `content-editor` spreads
`builtInRole('editor')` and inherits it. No custom role in the repo grants
`media:upload` directly, and nothing is deployed, so there is no migration.

`MediaDetailModal`'s `canUpload` prop existed only to gate the Save button, so it
became `canUpdate` rather than gaining a sibling.
