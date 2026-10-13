---
area: data
---

# Animated images get only WebP variants

An animated image lists no AVIF source, and an AVIF request redirects to its WebP variant (`packages/astromech/src/media/serving/handler.ts`).

**Why:** sharp writes no animated AVIF.

**Rejected:** WebP bytes under the AVIF URL (mislabelled on `filesystem()`); a first-frame AVIF (turns the animation into a still).
