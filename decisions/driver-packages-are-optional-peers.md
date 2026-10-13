---
area: config
---

# Driver packages are optional peers

A package reached only through an opt-in subpath (`sharp`, `@libsql/client`, `aws4fetch` and the like) is an optional peer, so a Workers site installs no `sharp` binary, and `check:node-imports` proves each one resolves. One the site already instantiates (`react`, `react-dom`, `better-auth`, `kysely`) is a required peer, so the site and the admin share one copy (`packages/admin/src/components/ui/instance-guard.ts` detects a second React).

**Rejected:** plain dependencies (ship native binaries to sites that never use them).
