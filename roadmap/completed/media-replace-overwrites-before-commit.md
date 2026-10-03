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

- [x] Write a failing test: replace an item with a file of the same extension,
      make the row update fail (`failWritesTo` in the harness), and read the
      stored original back.
- [x] Keep the old original safe until the row commits. The key stays
      `<id>.<ext>` so the URL does not change: a same-key replace copies the
      old file to a `tmp/` key first and puts it back if the write or the row
      update fails, unless another write changed the row first; a different
      key leaves the old original untouched until after the commit, and a
      failure deletes the new file. A failed replace also purges the item's
      variants, since one built from the new bytes in between is stored under
      the old version. `DECISIONS.md` ("A media replace keeps the original's
      key") records why a new key per replace lost.
- [x] Lower-case the extension in the key (`extOf` in
      `media/internal/keys.ts`, now the only copy in core): `a.JPG` and `b.jpg`
      are one file on a case-insensitive disk, so a replace between them
      deleted the file it had just written.
