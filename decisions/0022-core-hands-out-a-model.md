# 0022 — Core hands out a model; it does not wrap generation

**Date:** 2026-08-06
**Status:** accepted

The `ai` capability exposes only `getModel()`/`hasModel()`; consumers call the AI SDK's generation functions themselves. Rejected a `rewrite()`-style facade (the removed `ContentProvider` port's failure mode) and a second provider-agnostic layer; the chokepoint survives because boot stores `wrapLanguageModel`-wrapped instances, with day-one middleware logging completed calls only and spend limits left to the provider dashboard.
