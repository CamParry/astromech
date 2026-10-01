import type { EntryResource } from '../repository/types';
import type { FieldSource } from '@/content/prepare-fields';
import type {
    EntryStatus,
    JsonObject,
    ResolvedConfig,
    ResolvedEntryType,
    User,
} from '@/types/index';
import { prepareFields } from '@/content/prepare-fields';
import { inheritSharedFields } from '@/content/translatable';
import { entryRepository } from '../repository/entries-table';

/**
 * The three write paths that store field values, each with what its own
 * pre-step needs. A merge is an `'update'` to the parse, so the tag names the
 * write path rather than the operation.
 */
export type PrepareEntryFieldsInput = {
    /** Who the write is attributed to; the field validators read it. */
    user: User | null;
    config: ResolvedConfig;
} & (
    | {
          kind: 'create';
          entryType: ResolvedEntryType;
          values: Record<string, unknown>;
          locale: string;
          /** The entry a new translation belongs to; absent on a fresh create. */
          entryId: string | undefined;
          status: EntryStatus;
      }
    | {
          kind: 'update';
          entryType: ResolvedEntryType;
          currentEntry: EntryResource;
          patch: Record<string, unknown>;
          status: EntryStatus | undefined;
      }
    | {
          kind: 'merge';
          type: string;
          canonical: EntryResource;
          staged: EntryResource;
      }
);

/**
 * The fields an entry write stores, through `prepareFields`: a create inherits
 * the entry's shared fields, an update merges its patch over the current row, and
 * a merge takes the staged change's fields as they are. Throws a 422.
 */
export async function prepareEntryFields(
    input: PrepareEntryFieldsInput
): Promise<JsonObject> {
    const { config, user } = input;

    if (input.kind === 'create') {
        const type = input.entryType.id;
        return prepareFields({
            resource: 'entry',
            config,
            target: type,
            operation: 'create',
            user,
            status: input.status,
            values: input.values,
            inherit: (values) =>
                inheritSharedFields('entry', config, {
                    target: type,
                    // The shared read is by id and locale; an entry read names its type.
                    repository: {
                        findOne: (ref, opts) =>
                            entryRepository.findOne({ ...ref, type }, opts),
                    },
                    values,
                    id: input.entryId,
                    locale: input.locale,
                }),
        });
    }

    const { type, current, source, status } =
        input.kind === 'update'
            ? {
                  type: input.entryType.id,
                  current: input.currentEntry,
                  source: { base: input.currentEntry.fields, patch: input.patch },
                  // An update that omits `status` keeps the row's current one, so
                  // editing an already-published entry still enforces completeness.
                  status: input.status ?? input.currentEntry.status,
              }
            : {
                  type: input.type,
                  current: input.canonical,
                  source: { values: input.staged.fields as Record<string, unknown> },
                  status: input.canonical.status,
              };

    return prepareFields({
        ...(source satisfies FieldSource),
        resource: 'entry',
        config,
        target: type,
        operation: 'update',
        existing: current,
        user,
        status,
    });
}
