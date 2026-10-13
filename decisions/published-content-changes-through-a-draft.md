---
area: data
---

# Published content changes through a draft

Every edit to a published entry or global goes into one draft per locale, in its own table, and the live row changes only on publish, which copies the draft into that row so its id never changes. "Draft" is never a status ([drafts](../roadmap/planned/drafts.md)). A schedule is a record, not a status ([schedules](../roadmap/planned/schedules.md)).

**Why:** Sanity, Contentful, Strapi 5, Statamic, Kirby 5, EmDash and Payload all keep one pending copy.

**Rejected:** staged changes merged by hand (no CMS does it); draft rows in the content table (filters every query); Strapi's re-created rows (break relations); pausing a schedule on edit (Sanity; every autosave trips it).
