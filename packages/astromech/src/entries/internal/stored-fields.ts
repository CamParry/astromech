/**
 * The values an entry write stores, through the shared `writeFields` path: a
 * create inherits the entry's shared fields, an update merges its patch over the
 * current row, and a merge takes the staged change's fields as they are.
 */

import type { EntryRepository } from '../repository/types';
import type { EntryWithContentId } from './read-entry';
import type { FieldSource } from '@/content/write-fields';
import type {
    EntryStatus,
    JsonObject,
    ResolvedConfig,
    ResolvedEntryType,
    User,
} from '@/types/index';
import { RESOURCE_SPECS } from '@/content/resources';
import { inheritSharedFields } from '@/content/translatable';
import { writeFields } from '@/content/write-fields';
import { listEntryRows } from './read-entry';

/**
 * The three write paths that store field values, each with what its own
 * pre-step needs. A merge is an `'update'` to the parse, so the tag names the
 * write path rather than the operation.
 */
export type StoredFieldsInput = {
    /** Who the write is attributed to; the field validators read it. */
    user: User | null;
    config: ResolvedConfig;
    repository: EntryRepository;
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
          currentEntry: EntryWithContentId;
          patch: Record<string, unknown>;
          status: EntryStatus | undefined;
      }
    | {
          kind: 'merge';
          type: string;
          canonical: EntryWithContentId;
          staged: EntryWithContentId;
      }
);

/**
 * Turns what a caller sent into the values that go in the row. Throws a 422
 * when a field or the type's own validator reports.
 */
export async function toStoredFields(input: StoredFieldsInput): Promise<JsonObject> {
    const { config, repository, user } = input;
    const spec = RESOURCE_SPECS.entry;

    if (input.kind === 'create') {
        const type = input.entryType.id;
        return writeFields(
            spec,
            config,
            {
                values: input.values,
                inherit: (values) =>
                    inheritSharedFields(spec, config, {
                        target: type,
                        // The shared read is by id and locale; an entry read names its type.
                        repository: {
                            findOne: (ref, opts) =>
                                repository.get({ ...ref, type }, opts),
                        },
                        values,
                        id: input.entryId,
                        locale: input.locale,
                    }),
            },
            {
                target: type,
                operation: 'create',
                record: null,
                user,
                status: input.status,
                scan: () => listEntryRows(repository, type, input.locale),
            }
        );
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

    return writeFields(spec, config, source satisfies FieldSource, {
        target: type,
        operation: 'update',
        record: current,
        user,
        status,
        scan: () => listEntryRows(repository, type, current.locale),
        // The entry's own row is the only one the scan must ignore: its staged
        // copy shares its id and `list` excludes staged rows anyway.
        excludeId: current.id,
    });
}
