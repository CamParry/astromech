---
area: toolchain
---

# The gate keeps its logs in the git directory

`scripts/verify.mjs` writes each check's output to `verify/<check>.log` under the worktree's git directory and, on a pass, a stamp of the mode and the working tree's git tree id, which `verify:status` compares (`scripts/verify-stamp.mjs`). A commit of the verified content points at that tree id, so the stamp survives the commit and fails on any other change.

**Why:** agents reran checks to read output that had scrolled away, and leads reran gates a sub-agent had passed.

**Rejected:** a directory in the working tree (enters the content the stamp covers); `os.tmpdir()` (shared by every worktree); a stamp of HEAD (passes uncommitted work); HEAD plus a diff hash (breaks on every commit).
