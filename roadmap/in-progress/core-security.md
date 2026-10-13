---
milestone: 1.0
---

# Core security

What a site gets out of the box against password guessing, abusive clients and
bots, before anyone installs a plugin. Raised on 2026-10-03 from WPMU DEV
Defender; decided the same day.

Prerequisites: `roadmap/completed/auth-rate-limit-defects.md` (one trusted client
address and database-backed limits) and
`roadmap/completed/account-security-defects.md`. Suspension, two-factor sign-in
and API keys are `roadmap/planned/user-suspension.md`,
`roadmap/planned/two-factor-and-passkeys.md` and `roadmap/planned/api-keys.md`.
Opt-in policies are `roadmap/proposed/security-plugin.md`. The line between them
is `DECISIONS.md`, "Security in core is defaults and shared mechanisms".

## What exists

- `security.trustProxy` and the trusted client address
  (`packages/astromech/src/transport/http/client-address.ts`).
- `nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy` on every Hono
  response (`packages/astromech/src/transport/http/app.ts`).
- The captcha check (`packages/astromech/src/security/captcha/verify.ts`), which
  `@astromech/forms` uses by default.

## Prior art

- **OWASP Authentication Cheat Sheet:** count failed sign-ins against the
  account, not the address, and keep a lockout from becoming a way to lock other
  users out (for example, let password reset work while locked).
- **Payload** (5 attempts, 10 minutes), **Craft** (5 in an hour, 5 minutes),
  **Directus** and **Devise** count per account; **Kirby** counts per account
  and per address separately; **Laravel** keys on email and address. Directus
  and django-axes need an admin to unlock, which OWASP warns against.
- **Better Auth** has a per-address rate limiter and no password lockout. Its
  `captcha` plugin allows one `expectedAction` for every endpoint.
- **Defender:** one captcha setting applied to login, registration, lost
  password and comments, one script loaded once, one widget per form.
- **Cloudflare Turnstile:** with several widgets on a page, load the script
  with `render=explicit` and render each; a token is valid for 300 seconds and
  once; check `action` and `hostname` on the server.

## Decided (2026-10-03)

- **Two limits on sign-in.** Better Auth's per-address limiter, stored in the
  database. A per-account lock that ends on its own: 5 failures in 15 minutes
  locks the account for 5 minutes, doubling on each further lock up to 1 hour.
  The count clears on a successful sign-in or a password reset, and password
  reset works while locked. Rejected: counting account and address together,
  which a distributed attack walks around; and an admin-only unlock.
- **Automatic address blocks.** An address that fails across many accounts (20
  failures in 15 minutes) is blocked for 1 hour.
- **A block list with an allow list.** Automatic and manual blocks (an address
  or CIDR range, a reason, an expiry, the source) in one table, and an allow
  list that overrides every block. Checked on admin, auth, API and form routes.
  Each Workers isolate caches the list for 60 seconds, so an unblock takes up to
  a minute to apply.
- **Captcha is Astromech's own check.** One setting (provider, site key, secret
  from env) for Turnstile and reCAPTCHA v3. The script loads once, each
  form renders its own widget with its own action name, and the server verifies
  `success`, `action` and `hostname`. It runs as middleware in front of Better
  Auth's sign-in and reset-request routes, and `@astromech/forms` uses it by
  default; the providers move from the forms plugin into core. Rejected: Better
  Auth's `captcha` plugin (one action for every endpoint, and its failures never
  reach a hook). Revise the forms entry in `DECISIONS.md` when this lands.
- **HSTS as an opt-in header, and a frame header on the admin page.** The other
  headers exist on API responses, but the admin page itself is an Astro page
  that sends none, so another site can frame it (clickjacking). It gets
  `frame-ancestors 'self'`, which still lets the admin frame the site for
  `roadmap/planned/live-preview.md`. A site's pages use Astro's
  `security.csp`; the docs list the sources a captcha needs.
- **Security events in the activity log:** failed sign-ins, account locks,
  address blocks and unblocks, and captcha failures, in the table
  `roadmap/planned/audit-trail.md` adds.
- **A core Security screen** with the block list, the allow list and recent
  security events, behind its own permission.

## The work

- [x] The per-account lock: counters, escalation, clearing, and a before-hook
      on Better Auth's sign-in that refuses a locked account.
- [x] The block list and allow list tables, with `pnpm run db:generate` and the
      Cloudflare baseline hand-applied; the middleware and its cache; automatic
      blocks.
- [x] The captcha service: config, providers moved from `@astromech/forms`,
      the server check, the middleware on Better Auth's routes, a client
      renderer, and the admin sign-in and reset forms sending the token.
- [x] Opt-in HSTS, and `frame-ancestors 'self'` on the admin page.
- [ ] Security events written to the audit trail. Waits for the table in
      `roadmap/planned/audit-trail.md`, which lists each event's call site; the
      Security screen shows no events until then.
- [x] The Security screen and its permission.
- [x] Docs: the defaults, the settings, and the CSP sources a captcha needs.
- [x] `cf-connecting-ip` on workerd goes through the IP check the other address
      sources get, so a value that is not an IP address counts as no address
      (2026-10-13). A forged value cannot be refused in code: a deployed Worker
      receives the value Cloudflare wrote over the client's, and only wrangler's
      local proxy passes a client's own through.

## Testing

A sixth failed sign-in within the window is refused even with the right
password, and succeeds after the lock ends; a successful sign-in clears the
count; password reset works while locked; an address over the limit across
accounts is blocked and an allow-listed one never is; a captcha token for one
action is refused on another form; an unblock applies after the cache lifetime.

## Checks against real providers and Cloudflare

Merged on 2026-10-05. The tests stub `fetch` for siteverify, and
`check:boot:cloudflare` runs on local workerd; `check:boot` opens the Security
screen in chromium. These need real keys or a deployed Worker:

- [x] Each provider's real siteverify answer with a real site key and secret:
      Turnstile's `action` and `hostname`, and reCAPTCHA v3's `action`, `score`
      and `hostname`. Checked for Turnstile on 2026-10-13:
      the managed widget `astromech-testing` asks automated chromium to tick a
      box, so it was run in a real Chrome against the testing deployment with
      the captcha on (`scripts/check-deployed-cloudflare.mjs` header, 7). The
      widget passed without a challenge on `/cms/login` and
      `/cms/forgot-password`. The forgot-password page's token sent to
      `POST /cms/api/auth/request-password-reset` answered 200, and the
      sign-in page's (action `sign_in`) answered 403 `CAPTCHA_FAILED`. With
      the default `hostnames`, the 200 means siteverify answered the action
      `password_reset` and the hostname `astromech-testing.paragramagency.com`.
      The accepted token sent a second time answered 403. Checked for
      reCAPTCHA v3 the same day, in a real Chrome against the testing
      deployment with the captcha on: a token from `grecaptcha.execute` with
      the action `password_reset`, posted to siteverify with the secret,
      answered `success` true, the action `password_reset`, the hostname
      `astromech-testing.paragramagency.com` and a score of 0.9. On the
      forgot-password page, another such token sent to
      `POST /cms/api/auth/request-password-reset` answered 200; the same token
      again, a `sign_in` token and no token each answered 403
      `CAPTCHA_FAILED`.
- [x] The widgets in a browser: two Turnstile widgets on one page with
      `render=explicit`, token expiry and reset, reCAPTCHA v3's `execute`; the
      admin sign-in, setup and forgot-password pages with a captcha on and
      Astro `security.csp` set to the documented sources. Checked 2026-10-13
      in chromium (`check:deployed:cloudflare --captcha turnstile`): two
      widgets from `renderCaptcha` with Turnstile's test site key load one
      `api.js?render=explicit` and each give a token, and after a reset
      `getToken` waits for the widget's next callback. On the testing
      deployment the real widget renders on the sign-in and forgot-password
      pages under the documented policy, which blocks nothing of Turnstile's;
      on a local Worker with the test keys, so does setup, and all three send
      the token in `x-captcha-response`. The policy also blocked the admin's
      theme script, an `is:inline` script Astro does not hash; the shell now
      adds its hash to its own page's policy when `security.csp` is set, and
      `check:boot:cloudflare` builds with Astro's default policy and finds the
      hash of every inline script on `/cms` in its `script-src` (2026-10-13).
      The same policy refused the style element TipTap adds to the page on
      an entry edit page, so the editor sets `injectCSS: false`, its CSS ships
      in the admin's stylesheet, and `check:boot` drives the admin under
      Astro's default policy and fails on any violation (2026-10-13).
      Token expiry was checked in a real Chrome the same day (a test key's
      token did not expire in six minutes): a solved real widget left for 379
      seconds had renewed its own token (the response field changed and
      `turnstile.isExpired()` was false), its first token sent then answered
      403, and the page's form submitted then succeeded ("Check your email").
      reCAPTCHA v3 was checked the same day on the testing deployment
      (`check:deployed:cloudflare --captcha recaptcha`): the sign-in and
      forgot-password pages load `api.js?render=<site key>` and its badge frame
      from `https://www.google.com` under the documented policy, which blocks
      nothing, and `execute` gives each page's token (the item above). The
      first run found no frame on `/cms/login` within 30 seconds; a probe of
      the same deployment and a second run found it, so the page was probably
      served by the version before the deploy. reCAPTCHA has no test keys, so
      the setup page, which renders through the same `useCaptcha`, was not
      checked with it.
- [x] The hostname check behind a real proxy or CDN, and `hostnames` with
      Turnstile's test secret, which answers `example.com`. Checked
      2026-10-13: the test secret answers `success`, the hostname
      `example.com` and `metadata.result_with_testing_key: true`, but no
      `action`, so `verifyTurnstile` skips the action for such an answer and
      checks only the hostname. Rerun the same day
      (`check:deployed:cloudflare --captcha turnstile "test secret"`):
      `verifyCaptcha` passed the token with `hostnames: ['example.com']` and
      refused it with the default, naming `example.com`. Behind Cloudflare,
      a real token from a real Chrome passed with the default `hostnames`, the
      request's own host `astromech-testing.paragramagency.com` (the first
      item above).
- [x] On a deployed Worker: `ASTROMECH_CAPTCHA_SECRET` set with
      `wrangler secret put` is read, its absence refuses requests in
      production, and `cf-connecting-ip` reaches siteverify as `remoteip`.
      Checked 2026-10-13 on the testing deployment with Turnstile: with the
      captcha on and the secret put, `/cms`, `/` and the API answered 200,
      200 and 401; after `wrangler secret delete` they answered 500, the log
      naming the missing secret, and as before once it was put back
      (`check:deployed:cloudflare --captcha turnstile`). With siteverify's
      parameters logged by a temporary build, a sign-in with any token over
      IPv4 and over IPv6 sent `remoteip` equal to the request's
      `cf-connecting-ip` and to the address `/cdn-cgi/trace` showed for that
      family (the header's by-hand check 6). Reaching siteverify also shows
      the check itself read the secret: without one it returns first.
- [x] On production D1: the three new tables, the `sign_in_failures` upsert
      with `RETURNING`, and an unblock reaching other isolates within 60
      seconds. Checked 2026-10-11 on the testing deployment: the three tables
      exist, two refused sign-ins for one new email answered 401 twice and
      left its row at a count of 2, and after an unblock, IPv6 requests were
      refused for up to 58 seconds by isolates holding the cached list and
      never after (`check:deployed:cloudflare`).

## Left open

- **A blocked shared address blocks everyone behind it** for the hour; the
  allow list is the remedy.
- **The captcha check runs before Better Auth's limiter**, so a client can
  drive one siteverify call per attempt; a missing token costs none.
