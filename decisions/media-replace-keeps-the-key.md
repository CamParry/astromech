---
area: data
---

# A media replace keeps the file's key

A replace keeps the `<id>.<ext>` key and copies the old file aside to restore on failure (`packages/astromech/src/media/methods/replace.ts`). Two concurrent replaces of identical-looking files can still restore the wrong bytes.

**Why:** the URL stays stable; Strapi does the same with no rollback.

**Rejected:** a new key per replace (Payload; changes URLs, migrates every key).
