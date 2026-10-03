# Editor locking

Two editors who open the same entry and both save: the second save silently
overwrites the first. Split out of `planned/write-race-and-data-loss-defects.md`
on 2026-10-02, which guards lifecycle rules only.

## Prior art

- **WordPress post locking.** Opening a post sets `_edit_lock` (user and time),
  renewed by the Heartbeat API. A second editor sees who holds it and can go
  back, preview, or take over; the first editor is then told they lost it.
- **Payload document locking** (v3, `lockDocuments` on a collection). A lock
  row per open document with a timeout (300 seconds by default), and a
  take-over dialog.
- **Real-time collaboration.** Sanity edits through a shared document store, and
  Gutenberg's collaboration work uses Yjs. Several editors work at once, with no
  lock.
- **Optimistic concurrency.** The save sends the `updatedAt` it loaded, and a
  changed row answers 409. The cheapest option, but it tells the editor only
  after they have done the work.

## Open questions

- **Lock or collaborate.** A WordPress-style lock with take-over first, or go
  straight to multi-editor collaboration. A lock can ship alone; collaboration
  needs a sync layer, and on Cloudflare likely a Durable Object.
- **The backstop under a lock.** Whether saves also carry the loaded `updatedAt`,
  so a taken-over editor's stale save is refused, using the conditions in
  `content/write-guard.ts`.
- **Scope.** Entries and globals only, or users and media too.
- **What a lock is stored in**, and how it expires without a heartbeat on a
  stateless Worker.
