# 0051 — Settings are content, config is code, and there is no core settings page

**Date:** 2026-08-15
**Status:** accepted

## Decision

Astromech draws the configuration line the way the code-first CMS generation
(Payload, Sanity, Craft, Statamic, Strapi) draws it, not the way WordPress
draws it:

- **How the system runs is decided in code.** Drivers, adapters, connection
  strings, locale list, URL templates, timezone, roles — `astromech.config.ts`,
  with per-environment values from `.env`. None of it is admin-editable.
- **Secrets live in `.env` only.** SMTP credentials, captcha keys, provider API
  tokens are referenced from the config file and never written to the settings
  table. A settings value is, by policy, never a secret.
- **Site-wide editor-owned values are content.** Site name, tagline, logo,
  footer, socials — a `defineAdminPage` fields page declared by the site (the
  demo's `globals` page), values in the settings table, editable, translatable,
  validated through the same field pipeline as entries.
- **Core ships no general settings page.** The `/admin/settings` placeholder
  route is deleted. The settings subsystem's job is to back config-declared
  pages — the host's globals pages and plugins' settings pages — not a
  core-owned screen. Core itself reads no settings; every consumer is a plugin
  or the site, and that is the intended shape.

## Why

A survey of eight CMSs (WordPress, Payload, Strapi, Directus, Sanity, Craft,
Ghost, Statamic) split cleanly by generation. The DB-first generation defaults
configuration into the database and retrofits code overrides as hardening:
WordPress's `WP_HOME`/`WP_SITEURL` constants exist because site URL on
Settings › General was a mistake, and the admin greys the field out when the
constant is set. WP Mail SMTP stores credentials in `wp_options` and its own
docs tell you to move them to constants so admins cannot read them. The
code-first generation holds the opposite default and none of its five members
ships a general settings page. Statamic is the strongest evidence that this is
a conclusion rather than an omission: v2 had a full control-panel settings
area, and v3 removed it, moving application config to files only.

Two facts about Astromech's own architecture settled the local question:

- The argument for env-based config — "the Astro site can read the same
  values" — does not discriminate here, because the site reads DB settings
  in-process through `astromech/local` with the public/private visibility rule
  applied (`apps/demo/src/layouts/Site.astro` reads the `globals` key). Env is
  not needed for frontend access; it is needed for secrets and
  per-environment facts, which is what it keeps.
- The demo's `globals` page already implements the consensus pattern — field
  shape declared in code, values in the database, locale-split, validated by
  `processFields` — so the "settings UI" question was already answered by
  `roadmap/completed/unified-admin-pages.md`. A core settings page had nothing
  left to show.

## Rejected

- **A WordPress-style core General Settings page** (DB-backed site URL,
  homepage designation, admin-editable credentials). Rejected on the survey
  evidence above: the fields it would carry are either deployment facts that
  belong in code/env, or content that the config-declared page mechanism
  already handles with validation and localisation the bespoke page would lack.
- **Admin-editable secrets** (the WordPress plugin convention: paste the SMTP
  password into a settings screen). Rejected: every code-first system keeps
  third-party credentials in env, and `@astromech/backups` dumps the database,
  so a secret in the settings table is a secret in every backup artifact. The
  accepted cost is that rotating a credential requires a redeploy. Two
  refinements were noted for the future, neither adopted now:
    - **Craft's `$VARIABLE_NAME` pattern** — a settings field stores the env
      variable's name and resolution happens at read time, so dumps and diffs
      never contain the value. Adopt only when a settings value genuinely needs
      to be environment-dependent; nothing does today.
    - **The Ghost test** for whether a third-party key may ever be DB-stored:
      per-project and owner-facing (their Mailgun newsletter key) may live in the
      database; per-environment infrastructure (their transactional SMTP) never
      does. The deciding property is who owns the decision, not how sensitive
      the string is.
- **A read-only config mirror in the admin** (Strapi's Settings › Email ›
  Configuration: resolved provider shown, test button, nothing writable) — not
  rejected, but not built. It is the accepted answer if "is email configured?"
  ever needs an admin surface, and it requires no settings storage at all.

## Out of scope, recorded as open

The settings **storage model** was not changed by this decision. It is a KV
table (`packages/astromech/src/settings/schema.ts`) — key, JSON value,
namespaced by key convention — while the systems whose settings _split_ this
record adopts store the equivalent values as singleton documents in their
content system (Payload globals, Sanity singletons, Statamic global sets),
which buys versioning, drafts and audit history for free. Astromech's settings
have none of those, and a key with no admin page behind it writes unvalidated.
Whether settings-page values should eventually converge on entry-backed
singleton storage is a real question this record deliberately does not answer —
`roadmap/planned/settings-version-history.md` holds it, with the pressures and
the naming question.
