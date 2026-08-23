# 0026 — `@astromech/assistant`

**Date:** 2026-08-06
**Status:** accepted

`@astromech/authoring` renamed to `@astromech/assistant` (export `assistant`, `AssistantOptions`, `plugin_assistant_*` tables) because "authoring" is taken by plugin authoring and the package is a chat drawer reaching the whole method manifest. Migrations collapsed into one baseline instead of a rename migration, since nothing is deployed.
