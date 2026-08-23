# 0032 — A capability slot holds what the config declared

**Date:** 2026-08-09
**Status:** accepted
**Supersedes:** 0031 in part (its count of the strips in `resolveConfig`)

One rule: app-wide shared resources (`db`, `storage`, `email`, `media.image`, `ai`, `scheduler`, `plugins`, per-type `entries[].storage`) are declared in config and reached from a registry holding exactly what was declared, normalised, with nothing glued in from another key; per-entity behaviour (`validate`, `hooks`, `access`, `url`, `condition`) stays in config. Registries stay despite live config because the config module isn't importable from all four graphs and evaluates twice under `astro dev`. `from` moved into the email driver factory, `mediaRoute` deleted; `media.image = { driver, widths, avif }` beat `sharp({widths})`, `media: {widths}` and a root `image:`; lowercase driver factories, `consoleEmail()`, `interval()`/`webhook()`/`cloudflareCron()`.
