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
  from env) for Turnstile, reCAPTCHA and hCaptcha. The script loads once, each
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
      hCaptcha, the server check, the middleware on Better Auth's routes, a
      client renderer, and the admin sign-in and reset forms sending the token.
- [x] Opt-in HSTS, and `frame-ancestors 'self'` on the admin page.
- [ ] Security events written to the audit trail. Waits for the table in
      `roadmap/planned/audit-trail.md`, which lists each event's call site; the
      Security screen shows no events until then.
- [x] The Security screen and its permission.
- [x] Docs: the defaults, the settings, and the CSP sources a captcha needs.

## Testing

A sixth failed sign-in within the window is refused even with the right
password, and succeeds after the lock ends; a successful sign-in clears the
count; password reset works while locked; an address over the limit across
accounts is blocked and an allow-listed one never is; a captcha token for one
action is refused on another form; an unblock applies after the cache lifetime.
