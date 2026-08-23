# 0005 — "AI context", and the names rejected on the way

**Date:** 2026-08-03
**Status:** accepted

The feature is "AI context" (`useAIContext`, `AIContextReference`), an ordered list of typed references a route declares for the model; rejects "context bus" (bus means event bus, nothing emits or subscribes), "ambient"/"awareness"/"insight" (name a quality or outcome) and "UI context" (collides with React context). Generalises to a rule: use established web-ecosystem vocabulary, never a word already taken in-domain, and coin only with a `TERMINOLOGY.md` entry.
