---
area: toolchain
---

# `check:install` follows the installation guide

`scripts/check-install.ts` installs packed tarballs into a scratch site, reading its commands from `apps/docs/installation.md`, so the guide cannot drift from what is tested.

**Why:** workspace links hide packaging and generator defects.

**Rejected:** a fixture site (drifts from the guide); a stage in `verify` (the gate would need the network).
