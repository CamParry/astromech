# 0045 — The asset root stays declared, not inferred

**Date:** 2026-08-11
**Status:** accepted

`roadmap/planned/plugin-factory-extras.md` carried an open question: whether an
unpublished plugin's `root: import.meta.url` line could be inferred rather than
declared. Closed as **stays declared**.

A plugin defined inside an app (the demo's `rating` plugin is the live case)
has no package specifier for its assets, so relative component and locale
specifiers must resolve from its own directory — which only `import.meta.url`
in the plugin's own file can name. `definePlugin` cannot infer its caller's
module URL: `import.meta.url` is lexically scoped to the file that writes it,
and the alternatives — stack-trace parsing, a build-time transform — behave
differently across bundlers (Vite dev vs built worker) and mis-resolve every
asset path silently when they guess wrong. One explicit, documented line beats
that machinery, and the line doubles as a marker that the plugin is app-local.

Published packages never declare `root`; their relative specifiers resolve as
`<package>/<path>` against an `./admin/*` (and `./locales/*`) exports subpath,
which seo, assistant and backups all do. Closing the question surfaced one
stray: `@astromech/forms` declared `root: import.meta.url` while shipping no
admin assets at all — dead weight, and a misleading example of the in-tree
mode on a published package. Removed with this record.
