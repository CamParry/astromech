---
area: toolchain
---

# The Node floor is 22.13

Every published package's `engines` says `>=22.13.0`, and CI runs Node 22 and the Active LTS (`.github/workflows/ci.yml`).

**Rejected:** an unverified `>=20`; inheriting the floor from peer dependencies.
