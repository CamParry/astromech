# A 404 log in `@astromech/redirects`

`@astromech/redirects` (`packages/plugins/redirects/src`) adds a redirect when a
slug changes, but nothing records the URLs visitors miss. Raised on
2026-10-03. **Target: after 1.0.**

## Prior art

- **Statamic SEO Pro 7.7** (May 2026) added error tracking beside redirects.
- **WordPress Redirection** (2M+ installs) logs 404s and creates a redirect
  from the log.
- **Craft's Retour** does the same.

## Open questions

- How is the log kept small: one row per path with a count and last seen, and
  a retention limit?
- How does the plugin see a 404 a site page returns: middleware after the
  response?
