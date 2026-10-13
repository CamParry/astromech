---
area: data
---

# One `updatedAt` per resource

Every write stamps the resource row, so `updatedAt` is the latest change to anything about the resource, in any locale; a staged read reports the staged row's time, as Payload 3's draft read does (`packages/astromech/src/content/repository/content-table.ts`).

**Rejected:** a meaning per resource (sorting and caching disagree); the later of two columns (hides a missed stamp); the resource's time on a staged read (describes the published version).
