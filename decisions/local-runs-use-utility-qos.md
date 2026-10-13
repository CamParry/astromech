---
area: toolchain
---

# Local runs relaunch at utility QoS

On macOS outside CI, the gate and the heavy root scripts relaunch under `taskpolicy -c utility` with fewer workers (`scripts/run-at-lower-priority.mjs`), since macOS sets a QoS clamp only when a program starts. Utility still uses idle performance cores but yields them: on a 10-core MacBook, a foreground task beside a nine-thread spinner ran within 15% of its idle time, and up to twice as slow unclamped.

**Rejected:** `nice` (barely helps the foreground task); background QoS (efficiency cores only: 377 s against 78 s, and timing tests fail); worker caps alone; relaunching from the vitest config.
