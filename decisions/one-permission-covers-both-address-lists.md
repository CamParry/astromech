---
area: config
---

# One permission covers both address lists

`security:manage`, named after CASL's `manage`, both views and changes the block list and the allow list. The admin role holds it through `*`; editors do not.

**Why:** viewing and changing are one decision, since someone who can read who is blocked can unblock themselves.

**Rejected:** separate read and write permissions.
