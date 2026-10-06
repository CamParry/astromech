---
milestone: 1.0
---

# Astro `allowedDomains` follow-ups

Astro 7.3.6 changed how its Node adapter builds a request's URL: it trusts the
`Host` header only when it matches `security.allowedDomains`, and otherwise
uses `localhost` and the server's port. The
[installation guide](../../apps/docs/installation.md#2-add-the-integration-to-astro)
sets `allowedDomains` for this reason, and `scripts/check-install.mjs` follows
it. These gaps are left.

## Gaps

- [x] **A Node site served without a proxy has no client address.** With
      `allowedDomains` set and no `trustProxy`, `readRemoteAddress` in
      `packages/astromech/src/integrations/astro/remote-address.ts` drops
      Astro's `clientAddress` only when the request carries
      `x-forwarded-for`, the one case where Astro may have read the address
      from it. A request without the header keeps the connection's address.
      The startup warning is gone, and the runtime warning for a forwarding
      header without `trustProxy` fires whether or not an address is known.
      `DECISIONS.md` records the rule.
- [x] **A client that adds `x-forwarded-for` has no address.** On a Node site
      with `allowedDomains` and no `trustProxy`, such a request shares the
      address-less sign-in count, and the forms plugin's rate limit counts it
      too: every HTTP API request with no trusted address carries the shared
      `ctx.rateLimitKey` `no-trusted-ip`, as Better Auth's limiter does, and
      the forms plugin counts by that key
      (`packages/plugins/forms/src/service/forms.ts`). A block still cannot
      apply to such a request: the block list matches an address, and the
      request has none. `DECISIONS.md` records the rule.
- [ ] **The install guide job turns main red on an upstream release.** The
      `install` job in `.github/workflows/ci.yml` runs the guide's unpinned
      install on every push, so a new Astro release can fail a push that changed
      nothing related (Astro 7.3.6 did). Pin the push run to known versions,
      and keep a scheduled run against the newest releases to catch the next
      change.
- [x] **Code that reads `url.origin` trusts whatever Astro built.** The media
      route passes `url.origin` to `handleMediaRequest`
      (`packages/astromech/src/transport/http/app.ts`), which builds the
      `originUrl` an image driver fetches. Decided with no change: its only
      reader is the Cloudflare Images driver, whose `cf: { image }` fetch works
      only on Workers, where Cloudflare routes by `Host`, so `url.origin` is
      the site's own host. Revisit if a driver that fetches `originUrl` runs on
      Node.
