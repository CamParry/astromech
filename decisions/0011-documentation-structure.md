# 0011 — One question per document, and no history in the map

**Date:** 2026-08-04
**Status:** accepted

Each doc answers one question with each fact in exactly one file (AGENTS/ARCHITECTURE/TERMINOLOGY/decisions/roadmap/specs/apps/docs), and the map files carry present tense only, with history relocated to `decisions/` or `roadmap/completed/`; `check:docs` resolves every repo-relative link and backticked path. Rejects roadmap frontmatter (status is the directory), Spec Kit/Kiro's fixed three-file split, keeping `CLAUDE.md` primary (`AGENTS.md` is the cross-tool convention), and deleting history outright.
