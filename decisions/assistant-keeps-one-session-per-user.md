---
area: ai
---

# The assistant keeps one session per user

Each user has one resumable session, replaced when they start a new chat (`packages/plugins/assistant/src/sessions/repository.ts`). What the assistant did to a site belongs to the [audit trail](../roadmap/planned/audit-trail.md) at the `scopedServices` choke point, not to the session.

**Rejected:** a browsable library of chats (unbounded storage, retention, cross-user disclosure); storing the acting role on the session.
