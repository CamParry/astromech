---
area: config
---

# Block and allow lists are two tables

`blocked_addresses` and `allowed_addresses` each hold IP addresses and CIDR ranges, and the allow list wins (`packages/astromech/src/security/address-lists.ts`). They are checked on `${basePath}/api/*` and admin pages, not on media or site pages. Each process caches them for 60 seconds, since a Workers isolate cannot hear another's write. An automatic block never replaces or shortens a manual one, and blocking a range that covers the caller's own address is refused.

**Rejected:** one table with an `allow` flag (a block and an allow share no columns); checking media (mostly served from caches).
