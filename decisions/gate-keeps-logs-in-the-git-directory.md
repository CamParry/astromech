---
area: toolchain
---

# The gate keeps its logs in the git directory

`scripts/verify.ts` writes each task's output to `verify/<task>.log` under the worktree's git directory, and Turborepo's own output to `verify/turbo.log` there. What passed is not recorded beside them: Turborepo's cache is the record, and `verify:status` asks it whether a run would be all cache hits ([Turborepo runs the gate](turborepo-runs-the-gate.md)).

**Why:** agents reran checks to read output that had scrolled away.

**Rejected:** a directory in the working tree (enters the content `format:check` and `check:docs` read); `os.tmpdir()` (shared by every worktree); Turborepo's per-package `.turbo/` logs alone (scattered across ten directories).
