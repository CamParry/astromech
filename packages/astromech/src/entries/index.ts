/** `entries` module — entry CRUD service, repository, and scheduled jobs. */
import type { TypedEntriesService } from '@/types/index';
import { entriesService } from './service';

export { entriesService } from './service';
export { entryJobs } from './jobs/index';

/**
 * `entriesService` under its typed facade. `TypedEntriesService` layers
 * compile-time literal overloads over the wide runtime `EntriesService`, so this
 * is the one acknowledged place the cast happens — build consumer handles from it.
 */
export const typedEntriesService = entriesService as unknown as TypedEntriesService;
