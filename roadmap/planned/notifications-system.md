# Notifications System

Persistent, per-user notification inbox driven by system/background events. Distinct
from toasts (toasts = inline, real-time feedback for the current user's own action;
notifications = persistent, generated in the background, addressed to a user).

## Scope (v1)

- **System/event-driven only.** No human-authored "compose a message" UI.
- **Discrete events only.** Each emit corresponds to a thing that happened once
  (published, job failed, version restored). No condition-based/polled notifications,
  so no dedup machinery needed yet — see Deferred.
- **Copy-per-recipient storage.** One row per (user, notification). "Notify all admins"
  resolves to user ids at emit time and inserts a row each. Simple reads, simple
  per-user dismiss. Fine at Astromech's target scale.
- **Two states only.** `unread` (readAt null) → `read` (readAt set). **Dismiss = hard
  delete** the row. No `dismissed`/`archived` flag, no soft delete.
- **Point-in-time delivery.** Targets resolve to the current user set at emit time; a
  user created/promoted afterwards does not retroactively receive earlier notifications.

## DB & Core

- [ ] New domain module `packages/astromech/src/notifications/` (own `schema.ts`, service,
      barrel) — follows the modular per-domain convention, not a central `db/schema.ts`.
- [ ] `notificationsTable` in `packages/astromech/src/notifications/schema.ts`:
    - `id` (uuid pk)
    - `userId` (fk → users, `onDelete: 'cascade'`)
    - `type` (text — discriminator for icon/grouping, e.g. `entry.published`, `job.failed`)
    - `title` (text)
    - `message` (text)
    - `href` (text, **nullable** — click-through target, e.g. the published entry or job log)
    - `readAt` (timestamp, nullable — null = unread)
    - `createdAt` (timestamp)
- [ ] Repository helpers: `create()`, `listForUser(userId, { unread? })`,
      `unreadCount(userId)`, `markRead(id)`, `markAllRead(userId)`, `dismiss(id)` (delete),
      `dismissAll(userId)` (delete).

## Service — `notify()`

- [ ] `notify(input)` takes a **single object with a consistent `target` key** (target is
      always an object, never a bare id):
    ```ts
    notify({
      target: { user: 'usr_…' }   // one user
            | { role: 'admin' }    // all users with this roleSlug
            | { all: true },       // every user
      type, title, message, href?,
    })
    ```
- [ ] All three target shapes resolve to a list of user ids, then insert one row per id.
      Role resolution = users where `roleSlug` matches.

## API & SDK

- [ ] Routes: `GET /notifications` (supports `?unread=true`), `POST /notifications/:id/read`,
      `POST /notifications/read-all`, `DELETE /notifications/:id` (dismiss),
      `DELETE /notifications` (dismiss all). All scoped to the authenticated user.
- [ ] `notifications` namespace on local + fetch SDK: `list()`, `unreadCount()`,
      `markRead()`, `markAllRead()`, `dismiss()`, `dismissAll()`.
- [ ] Wire built-in emitters: scheduled entry published, version restored,
      trash auto-purged, CRON job errors.

## Plugin access

- [ ] Add `notify` to `PluginContext` in
      `packages/astromech/src/plugins/runtime/plugin-runtime.ts`, alongside the existing
      `sendEmail` / `emit` / `logger` methods — same construction pattern.
- [ ] **Auto-namespace `type` by plugin**, mirroring how `entries` is auto-scoped per
      plugin: a plugin emitting `type: 'sync-failed'` is stored as
      `plugin:<name>.sync-failed`, so plugin types can never collide with core types.
- [ ] Plugins use the same single-object signature; `target` resolution (user/role/all)
      is identical to core. Available wherever a `ctx` exists — hooks, CRON jobs, setup.

## Admin UI

- [ ] Replace the placeholder bell in the topbar with a live one: badge showing unread
      count, dropdown panel listing notifications date-descending.
- [ ] Per-row: title, message, relative time, click-through (href), dismiss (×).
- [ ] Mark-all-read and dismiss-all actions in the panel.
- [ ] Poll unread count from the topbar (~30s) for the badge.

## Deferred (not in v1)

- **Condition-based notifications** ("SSL expiring", "storage 90%") — these get
  re-evaluated and would re-notify after dismiss. Solve per-emitter with state-transition
  emission (fire only on change) when the first one is actually needed. Do not build
  generic dedup/idempotency-key infrastructure before there's a consumer.
- **Anti-spam / rate-limiting per source / duplicate suppression** — only relevant once
  condition-based or high-frequency emitters exist.
- **Auto-expiry + purge CRON** — no `expiresAt`. Notifications live until read+dismissed.
  Revisit if tables grow unbounded in practice.
- **Human-authored notifications** (admin broadcasts a custom message) — needs a compose
  UI; out of scope.
