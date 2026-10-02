# A failed media replace can leave new bytes under the old row

`packages/astromech/src/media/methods/replace.ts` writes the new original
before the row update. When the new file keeps the old extension, it
overwrites the stored original in place, so if the row update then fails, the
library shows the old item's size, type and dimensions over the new file.
Found reviewing the fix for
[media-delete-removes-files-first](../completed/media-delete-removes-files-first.md),
which moved the old files' removal after the commit but left the write first.

The class: any write to storage at a key a committed row already points at,
before the row change commits. Variants regenerated on replace have the same
shape.

## The work

- [ ] Write a failing test: replace an item with a file of the same extension,
      make the row update fail (`failWritesTo` in the harness), and read the
      stored original back.
- [ ] Write the new original (and variants) under a new key, update the row to
      point at it, then remove the old files after the commit, as delete now
      does. Check what the key scheme in `media/internal/store-file.ts` allows.
