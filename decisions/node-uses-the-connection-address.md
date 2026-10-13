---
area: config
---

# Without `trustProxy`, Node uses the connection

A Node site with no `security.trustProxy` uses Astro's `clientAddress`. It drops the address only when Astro's `security.allowedDomains` is set and the request carries `x-forwarded-for`, since Astro may then have read it from that header (`packages/astromech/src/integrations/astro/remote-address.ts`). A client that adds the header lands in the shared, address-less count; an honest client keeps its own. An address is checked with `node:net`'s `isIP`, which workerd also provides.

**Rejected:** dropping every address when `allowedDomains` is set (every Node site needs it, so one shared count); no address at all (one client locks every admin out); Zod's `ipv4`/`ipv6` (accepts `@_?` as IPv6).
