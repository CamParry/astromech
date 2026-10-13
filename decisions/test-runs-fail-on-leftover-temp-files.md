---
area: toolchain
---

# A test run fails on leftover temp files

Global setup makes one `astromech-test-*` directory per run and points the workers' `os.tmpdir()` inside it. Teardown fails the run when it holds anything test support does not make, or cannot be removed (`packages/astromech/tests/_support/run-temp-dir.ts`). Setup removes killed runs' directories, telling a dead run from a live one by the pid in an owner file.

**Why:** a worker thread never fires `process.on('exit')`, so per-worker clean-up leaked enough to fill a disk.

**Rejected:** an age limit alone (removes a long run's directory or keeps leaks); watching the system temp dir (cannot tell this run's files from another worktree's).
