---
area: toolchain
---

# A discarded return value is a lint error

A local type-aware rule flags a call statement whose result goes unused, when the function is declared in our packages and returns something other than `void` ([naming-conventions](../roadmap/planned/naming-conventions.md) adds it). `void call()` discards on purpose, as `let _ =` does for Rust's `#[must_use]`. Built-ins and libraries are exempt.

**Why:** a trial scan found every `before*` hook's returned payload dropped.

**Rejected:** eslint-plugin-functional's `no-expression-statements` (bans `void` and assignments too); true-myth's `must-use` (matches return types, not functions); SonarJS's `no-ignored-return` (a fixed list of built-ins).
