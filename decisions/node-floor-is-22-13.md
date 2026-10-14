---
area: toolchain
---

# The Node floor is 22.13

Every published package's `engines` says `>=22.13.0`, and CI runs Node 22 and the Active LTS (`.github/workflows/ci.yml`).

The repository's own floor, the root `package.json`'s `engines`, is 22.18: its scripts are TypeScript run by plain `node`, which strips types without a flag from that release (`roadmap/completed/scripts-review.md`). No script runs in a site, so the published floor stays.

**Rejected:** an unverified `>=20`; inheriting the floor from peer dependencies.
