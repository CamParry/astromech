# Notification channels and events

The notification system shipped (`completed/notifications-system.md`):
`notify({ target, type, title, message, href? })`, user, role and all targets,
the admin bell, and plugin `ctx.notify`. Almost nothing emits one, a row stores
finished English text, and the bell is the only way out. This file adds
channels, moves rows to message keys, and wires the first emitters. Decided on
2026-10-02.

## Prior art

- **Laravel Notifications.** A notification class's `via()` returns its channels
  (`mail`, `database`, `broadcast`, `slack`); each channel renders its own form
  (`toMail`, `toSlack`); packages add channels; an on-demand notification goes
  to an address that is not a user (`Notification::route('slack', …)`).
- **Novu and Knock.** Workflows deliver across channels, with preferences per
  user, per category and per channel.
- **WordPress and Ghost** emit from subscribers on their event bus; **Craft and
  Directus** inline. Craft stores a message key and variables and renders them
  in the recipient's language; Directus stores English strings and has no other
  language. WordPress emails a password or email change.
- **Ghost** lets each user turn categories off, and stops a recurring condition
  re-alerting with a "milestone reached" row and a cooldown.

## Decided

- **The rule.** A notification is for someone who must act, or who waits on a
  result. A record of what happened belongs to the audit trail
  (`planned/audit-trail.md`).
- **Notifications are declared.** `defineNotification({ type, category,
channels, params, text })` for core, exported for plugins. `channels` is the
  default list, as Laravel's `via()`; `text` is the `en` copy; `params` types
  what `notify(type, params, target)` accepts. The first segment of `type` is
  the category (`entry`, `user`, `job`, `plugin:<name>`).
- **Channels are registered.** Core ships `inApp` (the bell) and `email` (the
  configured email driver); a plugin adds one with `defineNotificationChannel`.
  A channel receives the rendered notification and the recipient. Slack is a
  future plugin channel (`proposed/additional-first-party-plugins.md`).
- **Two kinds of recipient.** Users, reached on their own channels, and site
  routes in config for an address no user owns, e.g.
  `notifications.routes: [{ channel: 'slack', categories: ['job'] }]`, as
  Laravel's on-demand notifications.
- **Targets:** a user, a role, everyone, or the users holding a permission
  (`{ permission: 'entry:post:publish' }`, resolved over roles with the
  matcher; decided 2026-10-04 for `roadmap/proposed/request-review.md`).
- **A row stores `type` and `params`**, replacing `title` and `message`. The
  bell renders at read time in the reader's language. Email renders on the
  server at send time in the recipient's language, a route in the site's. Both
  read one catalogue: each notification's `en` text, other languages from the
  existing locale bundles, a plugin's from its namespace. A plugin type with no
  `en` text warns in development.
- **Emission.** Subscribers on the after-hooks of `planned/hooks.md` by default;
  inline `notify()` only where no hook exists (cron, jobs).
- **Delivery never blocks the write.** External channels send after commit,
  through `waitUntil` on Workers. No retry yet: a failure is logged. A queue with
  retries is later.
- **Security notices are mandatory.** "Password changed" goes by `email`, and a
  user cannot turn it off. A bell message is read only after signing in, which
  is too late for a taken-over account.
- **Preferences come later**, per user, per category and per channel. The
  `type` naming and the channel list keep them a pure addition.
- **Condition-based alerts are deferred** until Ghost's pattern ("notified for
  X" row plus cooldown) exists. That includes anything that can repeat per
  request or per boot: a pending migration on boot (Workers boot often), an
  email send failure, a plugin hook error (logged only, `planned/hooks.md`),
  storage quota, failed sign-in spikes, server error spikes.

## The work

- [ ] `defineNotification`, `defineNotificationChannel`, the channel registry,
      and `notify(type, params, target)` resolving recipients (including the
      permission target), rendering per
      channel and delivering after commit.
- [ ] Replace `title` and `message` with `params` on `notifications`. Run
      `pnpm run db:generate` and hand-apply the change to `apps/demo-cloudflare`'s
      migration and snapshot. The bell renders through the catalogue.
- [ ] The `email` channel over the configured email driver, rendering in the
      recipient's language (`planned/locale-settings.md`).
- [ ] Config routes (`notifications.routes`).
- [ ] Plugin `ctx.notify` takes a declared type; update
      `apps/docs/plugins/authoring.md`.
- [ ] **First emitters, needing no hooks:** scheduled publish done (to the
      author), scheduled publish failed (author and admins), cron job failed
      (admins).
      The cron failure goes through Site health's stored check row, so a
      job failing every minute notifies once (`roadmap/planned/site-health.md`).
- [ ] **After hooks lands:** new user (admins), role changed (that user),
      password changed (that user, email, mandatory), backup failed (admins),
      and a long task or bulk import finished (whoever started it).

## Out of scope

- Version restored, entry trashed or restored, trash purged, backup completed:
  the audit trail records them.
- A new-device sign-in notice, which needs session tracking.
- Preferences UI, retries, condition-based alerts, a Slack channel.
