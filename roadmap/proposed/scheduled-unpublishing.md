# Scheduled unpublishing

An entry can be scheduled to publish
(`packages/astromech/src/content/jobs/scheduled-publish.ts`) but not to
unpublish. Raised on 2026-10-03. **Target: 1.0.**

## Prior art

- **Craft** has an expiry date; **Umbraco** schedules unpublishing.
- **WordPress** closed ticket #10296 as wontfix, yet PublishPress Future has
  100k+ installs.

## Proposal

- An optional unpublish time beside the publish time, run by the same job.
- Page caches are cleared when it runs (`roadmap/proposed/page-caching.md`).

## Open questions

- Does unpublishing return the entry to draft, or to a separate "expired"
  state that shows why it went?
- Can staged changes carry their own unpublish time?
