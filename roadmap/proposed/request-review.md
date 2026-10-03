# Requesting a review

`publish` is already a separate permission
(`packages/astromech/src/permissions/entry-permission.ts`), so a role can write
drafts without publishing them. What is missing is a way to say a draft is
ready. Raised on 2026-10-03. **Target: 1.0.** Depends on
`roadmap/planned/notifications-channels-and-events.md`.

## Prior art

- **Strapi's review workflows** (374 votes) are Enterprise-only, as approval
  stages are at Payload, Contentful (Premium) and Storyblok.
- **WordPress** has a Pending Review status and a Contributor role.
- **Craft** plans publishing workflows for 6.0.

## Proposal

- A "Request review" action on a draft or staged changes, for a user without
  `publish`.
- It notifies every user who can publish that entry, and the entry shows as
  awaiting review in the list.
- Publishing or editing clears the request.

**After 1.0:** custom review stages.

## Open questions

- Is "awaiting review" a status, or a flag beside the status?
- Can a reviewer send it back with a note (which overlaps the editorial
  comments plugin in `roadmap/proposed/additional-first-party-plugins.md`)?
