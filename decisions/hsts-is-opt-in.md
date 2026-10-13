---
area: config
---

# HSTS is opt-in

Core sends `Strict-Transport-Security` only when `security.hsts` asks (`packages/astromech/src/transport/http/strict-transport-security.ts`); Hono's other `secureHeaders` defaults stay. The admin page, which no Hono header reaches, gets `Content-Security-Policy: frame-ancestors 'self'` appended by the middleware, as a header because a `<meta>` policy cannot carry that directive. `X-Frame-Options: DENY` on API responses does not block live preview, whose frame loads a site page.

**Rejected:** HSTS by default, as Hono sends it (breaks a site, subdomain or staging host still on plain HTTP).
