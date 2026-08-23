# 0078 — the comment contract: no banners, JSDoc on the public surface

**Date:** 2026-08-20
**Status:** accepted

Bans section banners (`// ====`, `// ----`, ~290 removed); requires a JSDoc `/** */` block on every exported function, type and file, with `//` reserved for inline notes; three lines is a hard cap including file headers, with overflow dropped rather than moved. Rejected standardising on one banner variant.
