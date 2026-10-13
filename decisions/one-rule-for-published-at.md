---
area: data
---

# One rule sets `publishedAt`

A date the caller sends is stored as given; otherwise the status after the write decides, so re-publishing keeps the date (`packages/astromech/src/content/published-at.ts`).

**Why:** clients send `status: 'published'` with every save, so a date-based rule would restamp future dates.

**Rejected:** WordPress's rule (keeps the date across an unpublish); Strapi 5's (every publish moves the date); a rule per write path (the paths disagree).
