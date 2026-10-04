# Schedules

Publishing and unpublishing at a set time, as records of their own rather than
a status. Decided 2026-10-03. **Target: 1.0.** Builds on
`roadmap/planned/drafts.md`; absorbs the former scheduled-unpublishing
proposal.

## What exists

- `scheduled` is a status on the content row, with `publishedAt` as the time;
  a cron job publishes due rows every minute
  (`packages/astromech/src/content/jobs/scheduled-publish.ts`).
- A change to a published entry cannot be scheduled: the cron skips staged
  rows and merge ignores their times.
- There is no scheduled unpublish.

## Prior art

- **Payload:** `schedulePublish` jobs for publish and unpublish, several per
  document; a manual publish does not cancel them (a known pitfall).
- **Sanity scheduled drafts** (Growth plan), **Strapi Releases** (Growth),
  **Contentful scheduled actions** and **EmDash** schedule a draft over live
  content. Craft and Statamic are building it; WordPress needs PublishPress
  Revisions.
- **Craft** has an expiry date; **Umbraco** schedules unpublishing.
- What a schedule publishes: Payload, Strapi and EmDash publish the draft as it
  stands at run time; Sanity locks it.

## Decided (2026-10-03)

- **A schedule is a record:** the resource and its id (`entryId` or
  `globalId`), locale, action (`publish` or
  `unpublish`), time, and who set it. The `scheduled` status goes; the admin
  shows "Scheduled" when a publish schedule exists, and `publishedAt` stays as
  the displayed date.
- **Scheduling a published entry with a draft publishes the draft at that
  time**; the live content stays until then.
- **It publishes the draft as it stands at run time.** The editor sees
  "Scheduled for Fri 09:00. Edits made before then go out with it." Rejected:
  locking or pausing on edit (Sanity), which every autosave would trip.
- **At most one publish and one unpublish per locale** in 1.0.
- **A manual publish or unpublish cancels that locale's pending schedules.**
- **The run re-checks the creator's `publish` permission** and records who ran
  it; a failure is logged and the schedule kept.
- **A future `publishedAt` no longer hides a published row** (decided
  2026-10-04). Going live later is a publish schedule; `publishedAt` is the
  date shown. Today such a row goes live with no write, so nothing clears the
  page cache. Revise `DECISIONS.md`, "One rule decides the `publishedAt` a
  write stores", when this lands.
- The page cache is cleared when a schedule runs
  (`roadmap/planned/page-caching.md`).

## The work

- [ ] The schedules table, with `pnpm run db:generate` and the Cloudflare
      baseline hand-applied; migrate rows with status `scheduled`, and
      published rows with a future `publishedAt`, into schedules; drop the
      status.
- [ ] Schedule, reschedule and cancel methods; the cron job reads schedules.
- [ ] The admin: publish and unpublish times in the publish panel, the notice
      about later edits, "Scheduled" in the list.

## Testing

A scheduled draft goes live at its time and not before; edits made after
scheduling go out with it; a manual publish cancels the schedule; a scheduled
unpublish takes the entry down; a schedule whose creator lost `publish` does not
run.
