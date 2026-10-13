---
area: structure
---

# An operation's id is its method's name

`operationId` is the method's manifest name (`users.delete`, `plugins.forms.submit`), which is also the id RPC takes, so a generated client's name maps back to the method. A second route for one method adds `Many` for a list row (`entries.updateMany`), or its verb for a row the client never uses (`entries.queryGet`). Entry routes are documented once, for `{type}`.

**Rejected:** GitHub's `<namespace>/<operation>` (a second spelling of an existing id); Stripe's verb-and-path ids (unrelated to the method a caller knows); an id written on each row (drifts).
