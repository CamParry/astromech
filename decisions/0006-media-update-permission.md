# 0006 — `media:update` split out of `media:upload`

**Date:** 2026-08-03
**Status:** accepted

Split `media:update` out of `media:upload` because the published method manifest advertises a `media.update` tool whose stated permission named a different action; rejects the cheaper fix of rewording the descriptor to describe the grouping accurately. No blast radius; merging back is safe if no role ever distinguishes them.
