# Media folders

The media library has search and filters but no folders. Raised on
2026-10-03 and pulled into 1.0 so the design is settled up front. **Target:
1.0.**

## Prior art

- **Strapi:** folders shipped in 4.3 after #8612 (122 votes); folders in the
  content API (126 votes) are in progress.
- **Payload:** `folders: true` on any collection, media being one of them,
  shipped as beta; nested folders request (65 votes).
- **WordPress:** FileBird has 200k+ installs. **Craft**, **Statamic** and
  **Umbraco** have folders in core.

## Proposal

- Nested folders in the media library: create, rename, move, and drag media
  into them.
- A folder filter on the media picker and in the API.
- Designed so the same folders could apply to entries, as Payload's do.

## Open questions

- Do folders apply to entries too, or media only? If entries, how does that
  relate to parents in `roadmap/proposed/ordered-and-nested-entries.md`?
- Is a folder a storage path, or only a label in the database (recommended:
  only a label, so moving a file never changes its URL)?
- Do folders carry permissions?
