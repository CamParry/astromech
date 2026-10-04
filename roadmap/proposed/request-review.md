# Requesting a review

`publish` is already a separate permission
(`packages/astromech/src/permissions/entry-permission.ts`), so a role can write
drafts without publishing them. What is missing is a way to say a draft is
ready. Raised on 2026-10-03; shaped 2026-10-04. **Target: after 1.0**, as a
first-party plugin: not every site needs it.

## Prior art

- **A record of its own:** Contentful's `Workflow` links to an entry with a
  step and a completion date; Sanity's workflow plugin keeps separate metadata
  and does not change whether a document is published; Craft 6 has workflow
  runs (craftcms/cms#19667). **Strapi** puts a stage on each draft row.
- **Paywalled stages:** Strapi's review workflows (374 votes) are
  Enterprise-only, as approval stages are at Payload, Contentful (Premium) and
  Storyblok.
- **WordPress** has a Pending Review status and a Contributor role, and core
  emails nobody about pending posts; PublishPress Revisions emails the
  publishers and keeps a separate copy while the post stays live.
- **Per locale:** Drupal moderates each translation; Umbraco records Send to
  Publish per culture.
- **Edits do not restart a review** in Craft or Strapi.

## Shape (agreed 2026-10-04)

- **A `review_requests` record**, keyed by resource, id and locale, unique on
  the three: who asked and when, and an optional "changes requested" note.
  Not a status: a published entry stays live while its draft is reviewed.
- **Who:** anyone with `update` can request; the button replaces Publish only
  for users without `publish`. Everyone who can publish that type is notified,
  except the requester. A chosen reviewer comes later.
- **What clears it:** a publish (manual or scheduled), setting a publish
  schedule, discarding the draft, trash or delete, or the requester
  withdrawing. **Edits keep it pending**, since autosave would clear it on every
  pause. No lock: the editor says edits go into what is reviewed.
- **Request changes** with a one-line note sent to the requester. Threads stay
  in the comments plugin (`roadmap/proposed/additional-first-party-plugins.md`).
- **Admin:** "In review" beside the status and as a list filter; Request
  review, Withdraw and Request changes in the publish panel; an "Awaiting
  review" dashboard widget.
- **Events:** `requestReview`, `withdrawReview` and `requestChanges` methods
  with hooks named as in `roadmap/planned/hooks.md`; notifications
  `entry.reviewRequested`, `entry.changesRequested` and `entry.reviewPublished`.
- **Entries and globals.** Media and users have no drafts.
- **Naming:** "Request review", a "review request", "In review", "Request
  changes" (Craft and GitHub). Rejected: "Submit for review" (submit already
  means saving a form), "Pending review" (reads as a status), and "workflow" or
  "stage" (several steps).

## Core prerequisites, in 1.0

- A built-in `contributor` role (`roadmap/planned/permissions.md`).
- `notify()` targeting users who hold a permission
  (`roadmap/planned/notifications-channels-and-events.md`).

## What the plugin needs from core

Extension points that do not exist yet, to settle when the plugin is planned: a
slot in the publish panel, a column and filter in the entry list, and a way to
clear the record from core's publish, discard, schedule and trash.
