import type { GlobalResource } from '../repository';
import type {
    EntryStatus,
    JsonObject,
    ResolvedConfig,
    ResolvedGlobal,
    User,
} from '@/types/index';
import { prepareFields } from '@/content/prepare-fields';
import { inheritSharedFields } from '@/content/translatable';
import { globalRepository } from '../repository';

/**
 * The fields one locale of a global stores, through `prepareFields`: the patch
 * merged over `current`, or with no `current`, a new row that inherits a
 * translatable global's shared fields from the default locale. Throws a 422.
 */
export async function prepareGlobalFields(input: {
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
    const { global, id, locale, patch, current, status, user, config } = input;
    const write = {
        resource: 'global' as const,
        config,
        target: global.id,
        user,
        status,
        // One row per locale, so there is nothing else to be unique among.
        scan: async () => [],
    };

    return current
        ? prepareFields({
              ...write,
              operation: 'update',
              existing: current,
              base: current.fields,
              patch,
          })
        : prepareFields({
              ...write,
              operation: 'create',
              values: patch,
              inherit: (values) =>
                  inheritSharedFields('global', config, {
                      target: global.id,
                      repository: globalRepository,
                      values,
                      id: id ?? undefined,
                      locale,
                  }),
          });
}
