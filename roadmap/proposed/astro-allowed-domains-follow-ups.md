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

- [ ] **A Node site served without a proxy has no client address.** With
      `allowedDomains` set and no `trustProxy`, `readRemoteAddress` in
      `packages/astromech/src/integrations/astro/remote-address.ts` drops
      Astro's `clientAddress`, because Astro may have taken it from a
      client-sent `x-forwarded-for`. Every site that follows the guide is in
      this case, so every client shares one sign-in count, no address is ever
      blocked, and the forms plugin limits no one. `astro dev` and
      `astro build` print the startup warning for it, which
      `scripts/check-install.mjs` allows. `DECISIONS.md` rejected discarding
      the address only when the request carries `x-forwarded-for`, because a
      client could add the header to escape into the shared count. With
      `allowedDomains` the normal case, that rule is better than the current
      one: Astro sets `clientAddress` from `x-forwarded-for` only when the
      header is present (`FetchState`, `createRequestFromNodeRequest`), so
      without it `clientAddress` is the connection's address, and a client that
      adds the header lands in the count every client shares today. Revisit
      the decision, then the warning text and
      `apps/docs/configuration/trust-proxy.md`.
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
