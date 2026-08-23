# 0086 — One `validate` per layer, and `parseFields` keeps its verb

**Date:** 2026-08-22
**Status:** accepted

Four things named `validate` are split: the duplicated zod wrapper becomes one `parseInput` in `errors/validation.ts`, `parseFields` now throws (with `safeParseFields` returning reports), and `ParseContext.resourceValidate` becomes `validate`. `parse` keeps its verb over `validateFields`/`prepareFields`; the draft/publish `ValidationMode` stays, split into `checkCompleteness` and `checkCorrectness`.
