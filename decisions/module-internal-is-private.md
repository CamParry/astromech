---
area: structure
---

# A module's `internal/` is private to it

In `entries`, `globals`, `media`, `users` and `notifications`, `internal/` holds the helpers the module's own files share, and a lint rule refuses an import of it from elsewhere in core (`modulesWithInternal` in `eslint.config.js`). What other modules may use sits at the module root. A helper with one caller lives in that caller's file. Prior art: Go's `internal` packages.

**Rejected:** flattening `internal/` into the root (about 20 root files in `entries`, and the root stops listing what core may import); a convention without the rule (it drifted).
