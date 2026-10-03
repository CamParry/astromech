# `@astromech/security`

Policies a site opts into on top of core's security mechanisms
(`roadmap/planned/core-security.md`). The line between them is
`DECISIONS.md`, "Security in core is defaults and shared mechanisms". Raised on 2026-10-03 from WPMU DEV Defender, Wordfence and Solid
Security. **Target: after 1.0.**

## Candidates

- **404 lockouts.** Block an address that requests many missing pages
  (Defender's example is 20 in 300 seconds). A cost on every request, so a
  policy.
- **Country blocking.** `request.cf.country` is free on Workers; Node needs a
  MaxMind database. Cloudflare's own rules often do this better at the edge.
- **Admin access by IP allow list, per role.** Directus has per-policy
  `ip_access`.
- **Session controls:** an idle timeout, and a forced password reset for every
  user or one role (Defender Session Security and Reset Passwords).
- **Password rules:** minimum strength and banned passwords.
- **Breached-password check** when a password is set or reset, through the
  Have I Been Pwned range API (Defender, Wordfence, Better Auth's plugin). A
  policy because it calls an outside service. Better Auth's plugin covers only
  its own routes, and Astromech creates and resets passwords outside them, so
  the plugin calls the API itself.
- **"Unlock me" email link** for a locked-out user, and banned usernames.
- **Alerts** when lockouts spike, and a scheduled report.

## Left to the platform

WAF and managed rules, DDoS, edge rate limiting, bot blocking, site-wide IP and
country blocks, TLS. Malware and file scanning do not apply: a deploy is an
immutable build, so dependency auditing in CI covers the same risk.
