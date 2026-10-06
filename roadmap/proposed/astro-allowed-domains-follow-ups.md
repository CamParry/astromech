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
- [ ] **A client that adds `x-forwarded-for` has no address.** On a Node site
      with `allowedDomains` and no `trustProxy`, such a request shares the
      address-less sign-in count, but the forms plugin's rate limit skips it
      (`packages/plugins/forms/src/service/forms.ts`) and no block applies to
      it. Consider counting no-address requests in one shared forms bucket, as
      Better Auth's limiter does with its `no-trusted-ip` key.
- [ ] **The install guide job turns main red on an upstream release.** The
      `install` job in `.github/workflows/ci.yml` runs the guide's unpinned
      install on every push, so a new Astro release can fail a push that changed
      nothing related (Astro 7.3.6 did). Pin the push run to known versions,
      and keep a scheduled run against the newest releases to catch the next
      change.
- [ ] **Code that reads `url.origin` trusts whatever Astro built.** The media
      route passes `url.origin` to `handleMediaRequest`
      (`packages/astromech/src/transport/http/app.ts`), which builds the
      `originUrl` an image driver fetches. Behind a proxy that passes neither
      `Host` nor `X-Forwarded-Host`, or on a Node site without
      `allowedDomains`, that origin is `http://localhost:<port>`. Only the
      Cloudflare Images driver reads it today, and Workers are not affected.
      Decide whether such code should read a configured origin instead.
