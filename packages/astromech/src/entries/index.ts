/** `entries` domain module — entry CRUD service, storage, and scheduled jobs. */
import type { TypedEntriesService } from '@/types/index';
import { entriesService } from './service';

export { entriesService } from './service';
export { registerBuiltInEntryJobs } from './jobs/index';

/**
 * `entriesService` under its typed facade. `TypedEntriesService` layers
 * literal-type overloads over the wide runtime `EntriesService`
 * (`types/typed-entries.ts`); those narrowings are compile-time only, so this is
 * the one acknowledged place the erasure happens. Assemble consumer-facing
 * `entries` handles from this rather than casting afresh.
 */
export const typedEntriesService = entriesService as unknown as TypedEntriesService;
