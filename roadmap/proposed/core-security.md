# Core security

What a site gets out of the box against password guessing, abusive clients and
bots, before anyone installs a plugin. Raised on 2026-10-03 from WPMU DEV
Defender, which a WordPress developer installs on every site. **Target: 1.0.**

## Core or plugin

The rule this file proposes for every security feature:

- **Core holds defaults that are on for every site** with no configuration:
  rate limits, lockout, headers, sign-out everywhere.
- **Core holds mechanisms more than one surface or plugin uses:** the trusted
  client address, the counter store, the block list, the captcha contract and
  security events.
- **A plugin holds policies a site opts into** on top of those mechanisms
  (`roadmap/proposed/security-plugin.md`). The test: if turning it on for every
  site would surprise or break one, it is a policy.
- **The platform holds what must see traffic before the app does:** WAF, DDoS,
  site-wide IP and country blocks, TLS. A page built ahead of time never reaches
  the app, so an app-level block cannot cover it.

Once accepted, the rule moves to `DECISIONS.md`.

## Prior art

- **Defender** (free): lockout after 5 failures in 300 seconds, timed or
  permanent; IP allow and block lists with CIDR, where the allow list beats
  every ban; unban from its log page; one captcha setting (reCAPTCHA or
  Turnstile) applied to login, registration, lost password and comments;
  security headers; a breached-password check.
- **Payload:** `maxLoginAttempts` 5 and `lockTime` 10 minutes, stored on the
  user row, with an admin Unlock action.
- **Craft:** `maxInvalidLogins` 5 within an hour, then a 5-minute cooldown;
  `ipHeaders` for trusted proxies; elevated sessions for sensitive actions.
- **Ghost:** a growing wait after 4 failures, stored in the database.
- **Directus:** suspends the user after `AUTH_LOGIN_ATTEMPTS`; `IP_TRUST_PROXY`;
  helmet headers.
- **Better Auth** (installed, 1.6): a database-backed rate limiter, a `captcha`
  plugin (Turnstile, reCAPTCHA, hCaptcha), session freshness (`freshAge`), and
  a lockout on the second factor only. It has no first-factor lockout.

## Proposal

Prerequisite: `roadmap/planned/auth-rate-limit-defects.md` (one trusted client
address and database-backed limits).

- **Lockout after failed sign-ins**, counted per account and address together,
  so an attacker cannot lock a known admin out from elsewhere. Default 5
  failures in 5 minutes, then 10 minutes, with config to change it.
- **An IP block list:** one table for lockouts and manual blocks (an address or
  CIDR range, a reason, an expiry, the source), an allow list that overrides
  every block, and an Unblock action on a Security screen. Checked on admin,
  auth, API and form routes only, with a short per-isolate cache so a Worker
  does not read D1 on every request.
- **One captcha setting** (`provider`, site key, secret from env). Core builds
  Better Auth's `captcha` plugin from it for sign-in and password reset, and
  `@astromech/forms` uses it by default through the existing `SpamProvider`
  contract, whose `turnstile()` and `recaptcha()` factories move into core. One
  script per page, an explicit render per form, an action name per form so a
  token from one form is refused on another, and a reset after a failed sign-in
  (Turnstile tokens are single-use). This revises the forms entry in
  `DECISIONS.md` ("spam protection is an open `SpamProvider` contract").
- **Sign out everywhere** on a user's screen, and sessions revoked when a
  user's password changes or their role loses every permission.
- **Security headers on admin and API responses:** `nosniff`,
  `Referrer-Policy`, `frame-ancestors`, and HSTS when the site opts in. A
  site's pages use Astro's `security.csp`; the docs list the sources the captcha
  needs.
- **Security events in the activity log:** failed sign-ins, lockouts, unblocks
  and captcha failures, written from the sign-in hooks into the table
  `roadmap/planned/audit-trail.md` adds, since sign-in does not pass through
  `defineService`'s `bind`.
- Two-factor sign-in, passkeys and re-authentication before sensitive actions
  are `roadmap/proposed/two-factor-and-passkeys.md`.

## Open questions

- Does the lockout key on the account alone after enough failures from many
  addresses (Payload's model), or stay per account and address?
- Is the per-isolate block-list cache acceptable, given an Unblock takes up to
  its lifetime to apply?
- Does the Security screen live in core beside the activity log, or only once
  the plugin adds policies to it?
