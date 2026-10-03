# Editor locking

Two editors who open the same entry and both save: the second save silently
overwrites the first. Split out of `planned/write-race-and-data-loss-defects.md`
on 2026-10-02, which guards lifecycle rules only. Decided 2026-10-03.

## Prior art

- **WordPress post locking.** Opening a post sets `_edit_lock` (user and time),
  renewed by the Heartbeat API every 15 seconds. A second editor sees who holds
  it and can go back, preview, or take over; the first editor is then told they
  lost it.
- **Payload document locking** (`lockDocuments`, on every collection and global
  by default, so media and users too). A lock row per open document with a
  300-second timeout, and a take-over dialog. An update or delete from anyone
  but the holder fails; server code passes `overrideLock` (on by default) to
  skip the check.
- **Ghost** and **Contentful** instead require the version the client loaded on
  every update and answer 409 when it changed.
- **Real-time collaboration.** Sanity edits through a shared document store, and
  Gutenberg's collaboration work uses Yjs.

## Decided

- **A lock with take-over.** Collaboration is a separate future idea (a sync
  layer, likely a Durable Object on Cloudflare).
- **The save checks the lock.** A save or delete from a user other than the
  live lock holder answers 409, which also stops a taken-over editor saving a
  stale copy. Trusted server calls (cron, scheduled publish, plugins) skip the
  check, as Payload's `overrideLock` does. Rejected: sending the loaded
  `updatedAt` on every save (Ghost, Contentful), a second mechanism to explain
  for the case the lock check already covers.
- **Everything the admin edits:** entries, globals, media and users. The lock is
  keyed by resource type and id.
- **A core `locks` table** (resource type, id, user, expiry). The open form
  renews the lock every 30 seconds and it expires after 2 minutes, so a
  stateless Worker only compares times. Anyone with `update` on the resource can
  take over; the holder's form turns read-only with a notice. Closing the form
  releases the lock with `navigator.sendBeacon`.
- **On by default, with no setting**, until a site asks for one.

## The work

- [ ] The `locks` table, with `pnpm run db:generate` and the Cloudflare
      baseline hand-applied.
- [ ] Acquire, renew, release and take over, as service methods.
- [ ] The lock check in update and delete for each resource, skipped for
      trusted calls.
- [ ] The admin: acquire on opening a form, renew while open, the "being
      edited by" screen with take-over, and the read-only state after losing
      the lock.

## Testing

A second user's save fails while the lock is live and succeeds once it
expires; a take-over makes the first user's save fail; a trusted call ignores
the lock.
