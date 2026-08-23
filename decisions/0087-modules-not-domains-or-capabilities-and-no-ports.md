# 0087 — Modules, not domains or capabilities; no ports; no first runtime

**Date:** 2026-08-22
**Status:** accepted

Prose-only vocabulary change: everything under `src/` is a "module" (the five business ones are "the content modules"), the shelf below them gets no group name, the narrowed `PluginContext` members lose the "ports" label, and Node and Cloudflare Workers have equal standing. Rejected "infrastructure", "primitives", "domains" (DDD bounded-context freight) and "handle"/"plugin API".
