# 0030 — The server loads the config as a module

**Date:** 2026-08-09
**Status:** accepted
**Supersedes:** 0021 in part (its reasoning for the `ai.model` strip)

The Astro integration takes a path and `virtual:astromech/config` re-exports the author's module, with boot moved from `astro:config:setup` into the injected middleware so drivers, models and `{ custom: fn }` rules reach the serving process; rejected copying live values into registries at boot, which only worked in dev because build-time boot left deployed registries empty. Cost is two config evaluations (only one booted); the `ai` strip stays, now justified by `getAIConfig()`'s logging wrap rather than JSON serialisation.
