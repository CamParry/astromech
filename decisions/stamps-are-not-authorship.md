---
area: data
---

# `createdBy` and `updatedBy` are stamps, not authorship

The stamps are bare user ids recording which account wrote a row, and reads never resolve them. A byline is site content: fields on the user, a relationship to `users`, or the site's own author entry type ([Authors](../apps/docs/content/authors.md)).

**Why:** the account that creates an entry need not be its author.

**Rejected:** a `createdByRef` projection; author resolution in core (Payload's `authorship`, Strapi's `populateCreatorFields`; one reference made special); a first-party author type (row-level edit rules, a second bio).
