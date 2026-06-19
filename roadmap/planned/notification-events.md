# Notification Events

The underlying notification system is built and shipped (see
`completed/notifications-system.md`): `notify({ target, type, title, message, href? })`
with user/role/all targeting, the admin bell, and plugin `ctx.notify`. What's missing is
the actual wiring — almost nothing in the CMS emits a notification yet. This file is the
backlog of emitters to implement.

## Constraints every emitter must respect

- **Dismiss-only, discrete events.** Each emit = a thing that happened once. No read/unread.
- **`href` is admin-relative** (e.g. `/entries/123`) — the bell prepends the admin base.
- **`type` is dotted** (`entry.published`, `job.failed`); plugin types auto-namespace to
  `plugin:<name>.<event>`.
- **Condition-based / recurring checks are NOT yet supported** (storage quota, cert expiry,
  error spikes). They re-evaluate and would re-notify after dismiss — they need the
  state-transition emission pattern deferred in the infra file. Flag these; don't bolt on
  ad-hoc dedup.

## Implementation approach (settle before building)

- **A — inline `notify()`** at each domain site after the event commits.
- **B — a notifications subscriber on the existing event/hook bus** (`emitEvent` / after-hooks)
  that maps domain events → `notify()`, decoupling emitters from domain code.
- Likely a mix: bus-subscriber where an event already exists on the bus; inline otherwise.
  Pick the default so emitters are consistent.

## Candidate events

### Content & publishing

- [ ] Scheduled entry published (publishAt fired) → author — `entry.published`, href to entry
- [ ] Scheduled publish failed → author + admins
- [ ] Version restored → entry's actor/last editor
- [ ] Entry trashed / restored → admins
- [ ] Trash auto-purged (retention) → admins

### Users, auth & security

- [ ] New user created / invited → admins
- [ ] Role or permissions changed → affected user + admins
- [ ] Password changed → that user (security)
- [ ] Sign-in from a new device/location → that user (security) — needs device/session tracking
- [ ] Repeated failed logins over threshold → admins (security) — **condition-based, deferred**

### Jobs, cron & background

- [ ] Cron job failed → admins — `job.failed`, href to job/log
- [ ] Backup completed / failed (`@astromech/backups` via `ctx.notify`) → admins
- [ ] Long-running task completed → initiating user

### Media

- [ ] Bulk import / upload completed or failed → initiating user
- [ ] Storage quota warning → admins — **condition-based, deferred**

### System & errors

- [ ] Pending or failed migration on boot → admins
- [ ] Email send failure → admins
- [ ] Plugin hook error → admins (attributed to the plugin)
- [ ] Unhandled server error spike → admins — **condition-based, deferred**

### First-party plugins

- [ ] Define the `ctx.notify` usage convention and wire it where meaningful (backups,
      redirects, etc.).

## Cross-cutting decisions to settle

- **Default targets per event** (author vs editors vs admins) — agree a table.
- **i18n of copy.** `title`/`message` are stored as plain text at emit time. Which locale —
  the recipient's? Should emitters store message _keys_ + params and render per-recipient at
  read time instead of baked strings? Decide before wiring many emitters, as it shapes the
  schema/contract.
- **User opt-out / preferences per category** — future, but note it now so `type` naming
  stays category-friendly.
