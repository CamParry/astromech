# Notifications System

**DB & Core**

- [ ] `notificationsTable` in `src/db/schema.ts` — `id`, `type`, `title`, `message`, `userId`, `readBy`, `createdAt`, `expiresAt`
- [ ] `src/db/repositories/notifications.ts` — `create()`, `list()`, `markRead()`, `markAllRead()`, `deleteExpired()`
- [ ] Built-in CRON job to purge expired notifications

**Service**

- [ ] `src/notifications/index.ts` — `notify(notification)` helper
- [ ] Anti-spam: rate-limit per `source`, duplicate suppression within a window
- [ ] Wire built-ins: scheduled entry published, version restored, trash auto-purged, CRON job errors

**API & SDK**

- [ ] `GET /notifications` (supports `?unread=true`), `POST /notifications/:id/read`, `POST /notifications/read-all`
- [ ] `notifications` namespace on local + fetch SDK: `list()`, `markRead()`, `markAllRead()`
- [ ] Plugin context exposes `notify()`

**Admin UI**

- [ ] Poll unread every 30s from topbar; bell icon badge with unread count; dropdown panel with mark-all-read
