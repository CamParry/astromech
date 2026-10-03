# Additional First-Party Plugins

Each gets its own file when work on it starts. Order decided 2026-10-03:
import-export, Slack, WordPress importer, editorial comments.

## Prior art

- **Import-export.** Payload's `plugin-import-export`: CSV or JSON, import by
  `create`, `update` or `upsert` matched on a chosen field, relations as ids,
  one column per locale, draft or published selectable, run on the jobs queue,
  no media files. Directus imports and exports in core; Strapi's
  `export`/`import`/`transfer` CLI moves a whole project.
- **WordPress import.** Craft's Feed Me and Statamic's `statamic/importer` are
  first-party and both take WordPress content; WordPress's own importer reads
  WXR, maps old ids to new ones and fetches attachments.
- **Comments.** Public comments are core in WordPress and Ghost; editorial
  comments with @-mentions are in Directus and Sanity.

## The list

- [ ] `@astromech/import-export` — Payload's scope above. Whole-site moves stay
      with `@astromech/backups`.
- [ ] `@astromech/slack` — a notification channel
      (`planned/notifications-channels-and-events.md`) and its site routes.
      After that work lands.
- [ ] `@astromech/wordpress-import` — WXR into entries, media and users, the
      likeliest way a site arrives.
- [ ] `@astromech/comments` — editorial comments on an entry, with mentions
      that notify. A future idea beside `planned/editor-locking.md`, since both are
      about several people on one entry.
- [x] `@astromech/backups` — see `roadmap/completed/backups-plugin.md`

## Decided against

- **Activity log as a plugin.** It is a core admin page over the core audit
  trail (`planned/audit-trail.md`), as in Directus.
- **Public comments.** Astro sites tend to use a hosted service, and spam
  handling is a product of its own.
- **Analytics.** Only Ghost ships one. A tracking script is a settings field
  a site or `@astromech/seo` can own.
