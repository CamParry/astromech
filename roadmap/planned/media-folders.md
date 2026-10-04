---
milestone: 1.0
---

# Media folders

The media library has search and filters but no folders. Raised on
2026-10-03; decided 2026-10-04.

## What exists

- A media file's storage key is `<id>.<ext>`, so its URL never includes a
  folder.
- Media has no trash.

## Prior art

- **Requests:** Strapi shipped folders in 4.3 after #8612 (122 votes); folders
  in its content API (126 votes) are in progress. Payload has `folders: true`
  on any collection (beta) and a nested folders request (65 votes). FileBird has
  200k+ WordPress installs.
- **Labels in the database:** Strapi, Directus, Payload, Umbraco and Sanity;
  moving a file never changes its URL. Strapi also stores a folder path, which
  drifts.
- **Real paths:** Craft and Statamic move files on disk, and Craft has lost
  files doing so (#13118).
- **Deleting a folder:** Directus, Sanity and EmDash move its contents up;
  Strapi deletes them.
- **Folder permissions:** none of these ship them in core.

## Decided (2026-10-04)

- **Folders are labels in the database, never storage paths.** A
  `media_folders(id, parentId, name)` table and `folderId` on `media`. Names
  are unique within their parent, and no path is stored. Rejected: a shared
  `folders` table with a `scope` column; entry folders, if they come, get a
  table of their own.
- **Deleting a folder moves its contents into its parent.** Files are never
  deleted with a folder.
- **API:** media queries take `where: { folderId, includeSubfolders }` (Craft's
  names), and reads return `folderId`.
- **Admin:** folders in the media library (create, rename, move, drag files
  in); the media picker browses folders, and uploads go into the open folder.
- **Permissions:** creating a folder needs `media:upload`, renaming or moving
  one needs `media:update`, and deleting one needs `media:delete`. No
  per-folder permissions in 1.0.
- **No entry folders in 1.0.** A parent sets an entry's URL
  (`roadmap/planned/ordered-and-nested-entries.md`); a folder only organises the
  admin, as Payload 4 separates them. Saved list views
  (`roadmap/proposed/saved-list-views.md`) cover organising flat types.

## The work

- [ ] `media_folders` and `media.folderId`, with `pnpm run db:generate` and the
      Cloudflare baseline hand-applied.
- [ ] Folder methods and routes: create, rename, move (refusing loops),
      delete moving contents up; permissions.
- [ ] `where: { folderId, includeSubfolders }` and `folderId` in reads and
      `astromech/fetch`.
- [ ] The admin: folders in the library, drag to move, the picker, uploads into
      the open folder.
- [ ] `TERMINOLOGY.md` and `apps/docs`.

## Testing

Moving a file keeps its URL; deleting a folder moves its files and subfolders
to the parent; two folders with one name under one parent are refused; a folder
cannot move into its own subfolder; `includeSubfolders` returns nested files;
`media:update` alone cannot delete a folder.
