---
milestone: later
---

# Creating a related entry from the picker

The relationship picker
(`packages/admin/src/components/fields/relationship-field.tsx`) chooses
existing entries only, so an editor leaves the form to create a missing one.
Raised on 2026-10-03.

## Prior art

- **Sanity** #507, create a document from the reference picker (156 votes).
- **Directus**, inline editing in relational fields (130 votes).
- **Payload** opens a drawer to create or edit the related document.

## Open questions

- A drawer over the form (Payload) or a minimal create form?
- What does it create: a draft, or follow the parent's status?
