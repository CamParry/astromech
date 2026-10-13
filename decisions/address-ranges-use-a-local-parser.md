---
area: config
---

# Address ranges are parsed by a local helper

`packages/astromech/src/utilities/ip-address.ts` reads an IPv4 or IPv6 address or CIDR range into a bigint and a prefix, in about forty lines on `node:net`'s `isIP`.

**Why:** a published core carries and audits every package it declares, and this needs very little.

**Rejected:** `ipaddr.js` and `ip-address` (in the lockfile only as transitive dependencies).
