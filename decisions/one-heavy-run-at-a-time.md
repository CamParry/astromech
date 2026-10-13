---
area: toolchain
---

# One heavy local run at a time

The gate, the root `build`, `build:js` and `test:run` scripts and the boot checks take one lock file in `os.tmpdir()`, shared by every worktree and session (`scripts/lib/run-lock.ts`), since two such runs at once have been killed for low memory on a 16 GB laptop. A run that finds the lock held waits; a dead owner's lock is taken over. `typecheck` and `lint` skip it.

**Rejected:** a lock under the git directory (a second clone would not share it); a lockfile package (a dependency for under a hundred lines); a free-memory check (passes when two runs start together).
