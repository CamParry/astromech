# Notifications System

Persistent, per-user notification inbox driven by system/background events. Distinct from
toasts (toasts = inline, real-time feedback for the current user's own action; notifications
= persistent, generated in the background, addressed to a user).

**Status: shipped (infrastructure).** The system below exists end-to-end. The actual
emitters — wiring real CMS functionality to fire notifications — are tracked separately in
`planned/notification-events.md`; almost nothing emits yet.

## As-built model

- **System/event-driven only.** No human-authored "compose a message" UI.
- **Dismiss-only, discrete events.** A notification exists or is dismissed (hard-deleted).
  No read/unread state. (The design started with read/unread + dismiss and was simplified —
  the badge = count of undismissed; clicking a linked row dismisses it.)
- **Copy-per-recipient storage.** One row per (user, notification). "Notify all admins"
  resolves to user ids at emit time and inserts one row each.
- **Point-in-time delivery.** Targets resolve to the current user set at emit time; users
  created/promoted later don't retroactively receive earlier notifications.

## What shipped

- **Domain module** `packages/astromech/src/notifications/` (schema + service + barrel).
  `notificationsTable`: `id`, `userId` (fk → users, cascade), `type`, `title`, `message`,
  `href` (nullable, admin-relative), `createdAt`. No `readAt`.
  Migrations (app-owned, `apps/demo/drizzle/`): `0010` create, `0012` drop `read_at`.
- **`notify({ target, type, title, message, href? })`** — privileged server-side emit.
  `target` is `{ user } | { role } | { all }`; resolves to user ids → bulk insert.
- **User-facing API/SDK** (session-scoped, ownership in every WHERE): `GET /notifications`,
  `GET /notifications/count`, `DELETE /notifications/:id`, `DELETE /notifications`. SDK
  namespace: `list()`, `count()`, `dismiss()`, `dismissAll()`. Local in-process SDK shims throw.
- **Plugin access**: `ctx.notify` on `PluginContext`; `type` auto-namespaced to
  `plugin:<name>.<event>`.
- **Admin bell**: badge = undismissed count (polls 30s); dropdown lists newest-first; rows
  with an `href` are clickable (navigate + dismiss), rows without dismiss via × only;
  "Dismiss all"; empty/loading states.

## Deferred (not built)

- **Condition-based notifications** (storage quota, cert expiry, error spikes) — re-evaluate
  and would re-notify after dismiss. Need state-transition emission (fire only on change);
  don't build generic dedup before there's a consumer. See `planned/notification-events.md`.
- **Anti-spam / rate-limiting** — only relevant once condition-based/high-frequency emitters exist.
- **Auto-expiry + purge** — notifications live until dismissed.
- **Human-authored broadcasts** — needs a compose UI; out of scope.
