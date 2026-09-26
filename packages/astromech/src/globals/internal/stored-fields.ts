/**
 * The values a global write stores, through the shared `writeFields` path: a
 * first write to a locale inherits the global's shared fields, and any other
 * merges its patch over the current row.
 */

import type { GlobalRepository, GlobalResource } from '../repository';
import type {
    EntryStatus,
    JsonObject,
    ResolvedConfig,
    ResolvedGlobal,
    User,
} from '@/types/index';
import { RESOURCE_SPECS } from '@/content/resources';
import { inheritSharedFields } from '@/content/translatable';
import { writeFields } from '@/content/write-fields';

/**
 * Turns what a caller sent into the values that go in the row. Throws a 422 when
 * a field or the global's own validator reports.
 *
 * `current` absent means this locale has no row yet: the write is a create, and
 * a translatable global's shared (`translatable: false`) fields are inherited
 * from its default-locale row rather than taken from the patch.
 */
export async function toStoredFields(input: {
    repository: GlobalRepository;
    global: ResolvedGlobal;
    /** The global's row id, or null when nothing has been saved at all. */
    id: string | null;
    locale: string;
    patch: Record<string, unknown>;
    current: GlobalResource | null;
    /** The status the row has after the write; it decides the validation mode. */
    status: EntryStatus | undefined;
    /** Who the write is attributed to; the field validators read it. */
    user: User | null;
    config: ResolvedConfig;
}): Promise<JsonObject> {
    const { global, current, patch, config } = input;
    const spec = RESOURCE_SPECS.global;
    return writeFields(
        spec,
        config,
        current
            ? { base: current.fields, patch }
            : {
                  values: patch,
                  inherit: (values) =>
                      inheritSharedFields(spec, config, {
                          target: global.id,
                          repository: input.repository,
                          values,
                          id: input.id ?? undefined,
                          locale: input.locale,
                      }),
              },
        {
            target: global.id,
            operation: current ? 'update' : 'create',
            record: current,
            user: input.user,
            status: input.status,
            // One row per locale, so there is nothing else to be unique among.
            scan: async () => [],
        }
    );
}
