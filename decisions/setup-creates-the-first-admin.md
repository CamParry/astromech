---
area: data
---

# Setup creates the first admin; sign-up is closed

`POST /setup` creates the first admin through one atomic `INSERT … WHERE NOT EXISTS`, as Ghost, Strapi and Payload do (`packages/astromech/src/auth/setup.ts`). An admin creates every later account.

**Rejected:** counting users in a sign-up hook (racy); a row lock (SQLite has none); open sign-up with a default role (anyone gets content access).
