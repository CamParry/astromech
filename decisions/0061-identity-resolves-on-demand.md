# 0061 — The request store holds the request, and identity resolves on demand

**Date:** 2026-08-17
**Status:** accepted

`RequestContext` holds the `Request`; `getCurrentUser()`/`getCurrentRole()` are async, resolve on first ask and cache per request, replacing eager middleware resolution and four duplicate resolvers with one scope establisher. `App.Locals.user`/`session` deleted (host reaches identity through the application instance); `PluginContext.role` becomes an eager constructor parameter rather than a promise.
