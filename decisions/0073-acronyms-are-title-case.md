# 0073 — Acronyms in identifiers are title-case, with no length exception

**Date:** 2026-08-19
**Status:** accepted

Acronyms in identifiers are title-case regardless of length (`AiConfig`, `useAiContext`, `UiProvider`); renames `AI*` and `UI*`, the only all-caps holdouts against 179 title-cased identifiers. Rejected a two-letter carve-out because `Id` appears title-case in 112 identifiers. Platform globals, third-party keys and SCREAMING_SNAKE constants unaffected.
