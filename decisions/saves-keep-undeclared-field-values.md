---
area: data
---

# Saves keep values of undeclared fields

A save keeps field values the config no longer declares, and public reads drop them. A rename is the `astromech fields:rename` command ([field-rename-command](../roadmap/planned/field-rename-command.md)).

**Why:** a save between deploying the config and running the command loses nothing.

**Rejected:** dropping undeclared keys on save (loses values in that gap); rename detection or `renamedFrom` (the config cannot tell a rename); stable field ids (Craft 5, Contentful; written by hand).
