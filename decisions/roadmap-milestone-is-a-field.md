---
area: toolchain
---

# A roadmap file's milestone is a field

Each live roadmap file's frontmatter holds `milestone: 1.0` or `milestone: later`, its directory gives its status, and `scripts/docs-index.ts` writes progress into `roadmap/README.md`. Scope changes often, and a directory per milestone would make each change a `git mv` that breaks links. GitHub milestones, Kubernetes KEPs (`latest-milestone`) and Python PEPs (`Python-Version`) keep it as a field.

**Rejected:** milestone directories (`v1/`, `future/`); inline "**Target: 1.0.**" text (most files lacked it).
