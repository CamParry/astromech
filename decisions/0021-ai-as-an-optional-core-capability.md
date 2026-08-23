# 0021 — AI as an optional core capability

**Date:** 2026-08-06
**Status:** accepted

Model access lives in core at `src/ai/` beside `email/` and `cron/`, optional (`required: false`, `getModel` returns `undefined`), rather than in the assistant plugin, which the plugin boundary makes unreachable to other plugins. `AIConfig.model` is `Exclude<LanguageModel, string>` because `wrapLanguageModel` cannot wrap a gateway string, and the live model travels through `initRuntime`, never the JSON virtual config.
