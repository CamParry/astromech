# Versioning, Publishing & Scheduling

- [x] Versions: `entry_versions` table, `versioning: { maxVersions }` config, `VersionsRepository`, auto-save on content change with change-detection, `versions()`/`restoreVersion()` SDK + routes, version-history admin page with field diff + restore
- [x] Publishing: draft/published/scheduled status, `publishedAt`/`publishAt`, status + scheduling UI, publish/unpublish/schedule SDK + endpoints + bulk actions, extracted `PublishPanel`
- [x] CRON system: `CronJob`/`CronContext`, `registerCronJob()` (globalThis registry, plugin-accessible), `runScheduledJobs`/`handleScheduled` + admin-only HTTP trigger; built-in jobs — scheduled-publish, trash-purge, version trimming
