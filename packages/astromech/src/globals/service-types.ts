/**
 * The globals service contract and its input types: what `app.globals` offers.
 * `service.ts` binds the definition that implements it.
 */

import type { updateGlobalSchema } from './schema';
import type { Global, GlobalVersion, VersionMetadata } from '@/types/domain';
import type { z } from 'zod';

/**
 * The patch one `globals.update` call writes: fields, where omitted ones keep
 * their value, and optionally the status and publish gate.
 */
export type GlobalUpdateData = z.input<typeof updateGlobalSchema>;

/** The same patch once the method has parsed it: what the global update hooks see. */
export type ParsedGlobalUpdateData = z.output<typeof updateGlobalSchema>;

/**
 * The globals domain's service contract. Every method takes one options object
 * with `key` first and an optional `locale`; a missing locale is the default
 * content locale. There is no `query`, `create` or `delete`: a global exists
 * because the config declares it. An undeclared key is `ResourceNotFoundError`
 * from every method, `get` included.
 */
export type GlobalsService = {
    /**
     * One locale of one global, or null when it has never been saved there.
     * No fallback to another locale. Without `full` this is the public read:
     * it answers null unless the row is published and its publish gate has
     * passed, and strips `private` fields. `staged: true` requires `full` and
     * reads the staged change instead of the canonical row.
     */
    get(params: {
        key: string;
        locale?: string;
        /** Request the full (admin) shape instead of the default public shape. */
        full?: boolean;
        /** Read the staged change rather than the canonical row. Needs `full`. */
        staged?: boolean;
    }): Promise<Global | null>;
    /**
     * Write one locale, creating the global's row and that locale's content row
     * on demand. Fields merge: an omitted field keeps its stored value, and an
     * array or container value replaces wholesale. A locale other than the
     * default on a non-translatable global is a `ResourceValidationError`; on a
     * translatable one the new locale inherits the shared (`translatable:
     * false`) fields from the default-locale row.
     */
    update(params: {
        key: string;
        locale?: string;
        /**
         * Write this locale's staged change rather than its canonical row. It
         * must already exist — `createStaged` makes it — and the write takes no
         * version and propagates no shared fields. Needs the `staging`
         * capability.
         */
        staged?: boolean;
        data: GlobalUpdateData;
    }): Promise<Global>;
    /**
     * Move this locale to `published`, stamping `publishedAt` when it has none.
     * Needs the `statuses` capability and an already-saved locale.
     */
    publish(params: { key: string; locale?: string }): Promise<Global>;
    /**
     * Move this locale back to `unpublished` and clear its publish gate. Needs
     * the `statuses` capability and an already-saved locale.
     */
    unpublish(params: { key: string; locale?: string }): Promise<Global>;
    /**
     * Schedule this locale to publish at `publishedAt`: a `Date`, or the offset
     * ISO string one is coerced from. Needs the `statuses` capability and an
     * already-saved locale.
     */
    schedule(params: {
        key: string;
        locale?: string;
        publishedAt: Date | string;
    }): Promise<Global>;
    /**
     * The saved versions of this locale, newest first, as their metadata. Needs
     * the `versioning` capability and an already-saved locale.
     */
    versions(params: { key: string; locale?: string }): Promise<VersionMetadata[]>;
    /**
     * One saved version of this locale, by its number, with its snapshot. Needs
     * the `versioning` capability; a number with no version throws.
     */
    getVersion(params: {
        key: string;
        locale?: string;
        version: number;
    }): Promise<GlobalVersion>;
    /**
     * Roll this locale back to one of its versions, by its number, snapshotting
     * the state being overwritten first. Needs the `versioning` capability.
     */
    restoreVersion(params: {
        key: string;
        locale?: string;
        version: number;
    }): Promise<Global>;
    /**
     * Stage a change: copy this locale's content into a second, linked row,
     * which `update` with `staged: true` then edits. Needs the `staging`
     * capability and an already-saved locale; throws `StagedChangeExistsError`
     * when one already exists.
     */
    createStaged(params: { key: string; locale?: string }): Promise<Global>;
    /**
     * This locale's staged change, or null. Needs the `staging` capability.
     * `diverged` is true when the canonical was written after the staged change
     * was made from it.
     */
    getStaged(params: {
        key: string;
        locale?: string;
    }): Promise<(Global & { diverged: boolean }) | null>;
    /**
     * Merge the staged change into the canonical row (snapshot, overwrite,
     * discard) and return the updated canonical. Content-only: the canonical's
     * status is untouched.
     */
    mergeStaged(params: { key: string; locale?: string }): Promise<Global>;
    /** Discard this locale's staged change (hard delete). */
    deleteStaged(params: { key: string; locale?: string }): Promise<void>;
};
