---
area: data
---

# Each resource has its own three tables

An entry is `entries`, `entry_content` (one row per locale) and `entry_versions`, like Drupal's `node` and `node_field_data`; globals, media and users follow the same shape.

**Why:** the owner foreign key is real, with no discriminator.

**Rejected:** one shared table for all resources (id prefixes, an owner column with no foreign key).
