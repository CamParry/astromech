/**
 * Astromech Server Entries API
 *
 * Unified entries object for direct database access in Astro server-side code.
 * Import from 'astromech/local'.
 *
 * This module is the entries *service*: it owns policy (zod validation,
 * plugin hooks, relationship persistence + populate + incomingRelations,
 * versioning decisions, base-slug computation, locale-propagation decisions,
 * bulk dispatch) and dispatches all row persistence through the internal
 * `EntryStorage` contract (`src/storage/entries`). The built-in storage is
 * the only Phase 2 implementation; Phase 3 mounts per-type storages via the
 * registry with zero service changes.
 *
 * Surface: options-object shape, type required on every call; bulk-capable
 * methods accept `id: string | string[]`.
 */

import config from 'virtual:astromech/config';
import { z } from 'zod';
import { ValidationError } from '@/errors/validation.js';
import {
    EntryTypeMismatchError,
    BulkOperationError,
    CapabilityError,
    StagedEntryExistsError,
} from './errors.js';
import {
    createEntrySchemaFor,
    updateEntrySchemaFor,
    scheduleEntrySchema,
} from './schema.js';
import { getDb } from '@/database/registry.js';
import { RelationshipsRepository } from '@/database/repositories/relationships.js';
import {
    PreviewTokensRepository,
    hashPreviewToken,
} from '@/database/repositories/preview-tokens.js';
import { populateEntries } from './data/populate.js';
import { getEntryStorage } from './storage/registry.js';
import { resolveEntryType } from './type-registry.js';
import { resolveContentLocale } from '@/utilities/locale.js';
import type { EntryRecord, EntryStorage, StorageDb } from './storage/types.js';
import type {
    Entry,
    EntryStatus,
    EntryVersion,
    EntriesApi,
    EntriesStagingApi,
    EntryQueryParams,
    EntryUpdateData,
    EntryDuplicateOverrides,
    IncomingRelation,
    QueryResult,
    JsonObject,
    User,
    FieldDefinition,
} from '@/types/index.js';
import { getCurrentUser, setCurrentUser } from '@/context/index.js';
import {
    hasHookHandlers,
    runAfterHooks,
    runBeforeHooks,
} from '@/plugins/runtime/plugin-runtime.js';
import { slugify } from '@/utilities/strings.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import {
    applyVisibilityWithRelations,
    isPublicBranded,
    markPublic,
    PublicShapeWriteError,
    type VisibilityShape,
    type AudienceContext,
} from './visibility.js';

// ============================================================================
// Validation Helper
// ============================================================================

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (err) {
        if (err instanceof z.ZodError) throw new ValidationError(err.issues);
        throw err;
    }
}

function getDefaultLocale(): string {
    // `defaultLocale` is a DISPLAY tag (e.g. `en-GB`) and may not be a content
    // locale that entries are tagged with. The storage layer matches locale
    // EXACTLY, so bridge the display tag down its RFC 4647 fallback chain to an
    // available content locale; fall back to the first configured locale.
    const cfg = config as { defaultLocale?: string; locales?: readonly string[] };
    const locales = cfg.locales ?? [];
    const requested = cfg.defaultLocale ?? 'en';
    return resolveContentLocale(requested, locales) ?? locales[0] ?? requested;
}

/**
 * Narrow a storage `EntryRecord` to the public `Entry`. The built-in storage —
 * the only Phase 2 implementation — always returns full, locale-enriched
 * Entries. The contract is intentionally wider (`EntryRecord`) so Phase 3
 * single-table storages need not carry every capability column.
 */
function asEntry(record: EntryRecord): Entry {
    return record as Entry;
}

// ============================================================================
// Server Context (populated by middleware)
// ============================================================================

/**
 * @deprecated Use setCurrentUser from @/context/index.js instead.
 */
export function initServerContext(ctx: {
    db: unknown;
    config: unknown;
    user: User | null;
}): void {
    setCurrentUser(ctx.user);
}

// ============================================================================
// Slug Utilities
// ============================================================================

/**
 * @deprecated Slug uniqueness is now a storage concern. Kept for the existing
 * public export; delegates to the built-in storage for the given type.
 */
export async function generateUniqueSlug(
    type: string,
    locale: string,
    baseSlug: string,
    excludeId?: string
): Promise<string> {
    return getEntryStorage(type).uniqueSlug(type, locale, baseSlug, excludeId);
}

// ============================================================================
// Relationship + version helpers (policy — stay in the entries service)
// ============================================================================

async function saveRelationships(
    db: StorageDb,
    entryId: string,
    fields: JsonObject,
    typeName: string
): Promise<void> {
    const relationshipsRepo = new RelationshipsRepository(db);
    const entryTypeConfig = resolveEntryType(config, typeName);

    if (!entryTypeConfig) return;

    for (const field of flattenEntryFields(entryTypeConfig.fields)) {
        if (field.type !== 'relationship') continue;
        if (!field.target) continue;

        const fieldValue = fields[field.name];
        if (!fieldValue) continue;

        const targetType = field.target === 'users' ? 'user' : 'entry';

        const targetIds = Array.isArray(fieldValue)
            ? (fieldValue as string[])
            : [fieldValue as string];

        await relationshipsRepo.replaceAll(
            entryId,
            'entry',
            field.name,
            targetIds,
            targetType
        );
    }
}

function getTitleField(typeName: string): 'title' | false {
    return resolveEntryType(config, typeName)?.titleField ?? 'title';
}

function isVersioningEnabled(typeName: string): boolean {
    return (
        getEntryStorage(typeName).versions !== undefined &&
        !!resolveEntryType(config, typeName)?.versioning
    );
}

function assertCapability(
    typeName: string,
    capability: 'statuses' | 'slug' | 'trash' | 'versioning' | 'translatable' | 'staging'
): void {
    const caps = resolveEntryType(config, typeName)?.capabilities;
    if (caps && !caps[capability]) {
        throw new CapabilityError(typeName, capability);
    }
}

/**
 * Assert the type supports staging (capability + built-in storage, the only
 * backend that carries `stagedFor` in v1) and return both the storage and its
 * (now-narrowed) staging sub-surface.
 */
function getStagingStorage(typeName: string): {
    storage: EntryStorage;
    staging: NonNullable<EntryStorage['staging']>;
} {
    assertCapability(typeName, 'staging');
    const storage = getEntryStorage(typeName);
    const staging = storage.staging;
    if (!staging) {
        throw new Error(
            `Entry type "${typeName}" does not support staging (built-in storage required).`
        );
    }
    return { storage, staging };
}

// ============================================================================
// Preview (forward versioning) helpers
// ============================================================================

/** Generate a high-entropy preview token secret (32 random bytes, hex). */
function generatePreviewSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** True if `token` is a current preview token for the canonical `entryId`. */
async function verifyPreviewToken(entryId: string, token: string): Promise<boolean> {
    const hash = await hashPreviewToken(token);
    return new PreviewTokensRepository(getDb()).isValid(entryId, hash, new Date());
}

const previewAudience = (): AudienceContext => ({ roleSlug: null, now: new Date() });

function resolveRelatedFieldsFor(related: Entry): FieldDefinition[] {
    const relTypeCfg = resolveEntryType(config, related.type);
    return relTypeCfg ? flattenEntryFields(relTypeCfg.fields) : [];
}

/** Apply the preview projection (public shape, publish-gate bypassed). */
function projectPreview(entry: Entry, fields: FieldDefinition[]): Entry | null {
    const filtered = applyVisibilityWithRelations(
        entry,
        { shape: 'public', preview: true, fields, audience: previewAudience() },
        resolveRelatedFieldsFor
    );
    return filtered ? markPublic(filtered) : null;
}

/**
 * Preview list read. Resolves canonicals matching the filters WITHOUT the
 * publish gate, verifies the token against each, optionally swaps to the staged
 * change, and returns the preview (public) shape. Unauthorized/absent token →
 * empty result (the front-end renders a 404).
 */
async function runPreviewQuery(
    params: EntryQueryParams & { type: string | readonly string[] }
): Promise<QueryResult<Entry>> {
    const perPage = typeof params.limit === 'number' ? params.limit : 20;
    const empty: QueryResult<Entry> = {
        data: [],
        pagination:
            params.limit === 'all'
                ? null
                : { page: params.page ?? 1, limit: perPage, total: 0, pages: 0 },
    };

    const token = params.previewToken;
    const typeParam = params.type;
    const type = Array.isArray(typeParam) ? typeParam[0] : (typeParam as string);
    if (!token || !type) return empty;

    const storage = getEntryStorage(type);
    const entryTypeCfg = resolveEntryType(config, type);
    const fields = entryTypeCfg ? flattenEntryFields(entryTypeCfg.fields) : [];

    const { data: rows } = await storage.list({
        type,
        locale: params.locale ?? getDefaultLocale(),
        where: params.where,
        sort: params.sort,
        limit: params.limit ?? 1,
        page: params.page ?? 1,
    });

    const out: Entry[] = [];
    for (const row of rows) {
        const canonical = asEntry(row);
        if (!(await verifyPreviewToken(canonical.id, token))) continue;

        let target: Entry = canonical;
        if (params.staged) {
            const staged = await storage.staging?.getByCanonical(canonical.id);
            if (!staged) continue;
            target = asEntry(staged);
        }

        let result = target;
        if (params.populate && params.populate.length > 0 && entryTypeCfg) {
            const populated = await populateEntries(
                getDb(),
                [result],
                fields,
                params.populate
            );
            result = populated[0] ?? result;
        }

        const projected = projectPreview(result, fields);
        if (projected !== null) out.push(projected);
    }

    if (params.limit === 'all') return { data: out, pagination: null };
    return {
        data: out,
        pagination: {
            page: params.page ?? 1,
            limit: perPage,
            total: out.length,
            pages: out.length > 0 ? 1 : 0,
        },
    };
}

/** Preview single read by canonical id (see runPreviewQuery). */
async function runPreviewGet(
    type: string,
    id: string,
    params: { populate?: string[]; previewToken?: string; staged?: boolean }
): Promise<Entry | null> {
    const token = params.previewToken;
    if (!token) return null;

    const storage = getEntryStorage(type);
    const record = await storage.get(id); // excludes trashed
    if (!record) return null;
    if (record.type !== undefined && record.type !== type) return null;

    const canonical = asEntry(record);
    if (!(await verifyPreviewToken(canonical.id, token))) return null;

    let target: Entry = canonical;
    if (params.staged) {
        const staged = await storage.staging?.getByCanonical(canonical.id);
        if (!staged) return null;
        target = asEntry(staged);
    }

    const entryTypeCfg = resolveEntryType(config, type);
    const fields = entryTypeCfg ? flattenEntryFields(entryTypeCfg.fields) : [];

    let result = target;
    if (params.populate && params.populate.length > 0 && entryTypeCfg) {
        const populated = await populateEntries(
            getDb(),
            [result],
            fields,
            params.populate
        );
        result = populated[0] ?? result;
    }

    return projectPreview(result, fields);
}

async function buildRelationsSnapshot(
    db: StorageDb,
    entryId: string
): Promise<Record<string, string | string[]>> {
    const relRepo = new RelationshipsRepository(db);
    const rels = await relRepo.getBySource(entryId, 'entry');
    const byName = new Map<string, string[]>();
    for (const rel of rels) {
        const list = byName.get(rel.name) ?? [];
        list.push(rel.targetId);
        byName.set(rel.name, list);
    }
    const snapshot: Record<string, string | string[]> = {};
    for (const [name, ids] of byName) {
        const [first] = ids;
        snapshot[name] = ids.length === 1 && first !== undefined ? first : ids;
    }
    return snapshot;
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== (b as unknown[]).length) return false;
        return (a as unknown[]).every((v, i) => deepEqual(v, (b as unknown[])[i]));
    }
    const keysA = Object.keys(a as object).sort();
    const keysB = Object.keys(b as object).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) =>
        deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
    );
}

function getNonTranslatableFieldNames(typeName: string, fieldNames: string[]): string[] {
    const entryTypeConfig = resolveEntryType(config, typeName);
    if (!entryTypeConfig?.translatable) return [];
    const nonTranslatable: string[] = [];
    for (const field of flattenEntryFields(entryTypeConfig.fields)) {
        if (fieldNames.includes(field.name) && field.translatable === false) {
            nonTranslatable.push(field.name);
        }
    }
    return nonTranslatable;
}

function buildIncomingRelations(
    typeName: string,
    fields: JsonObject
): Record<string, string | string[]> {
    const entryTypeConfig = resolveEntryType(config, typeName);
    if (!entryTypeConfig) return {};
    const relations: Record<string, string | string[]> = {};
    for (const field of flattenEntryFields(entryTypeConfig.fields)) {
        if (field.type !== 'relationship') continue;
        const val = fields[field.name];
        if (val !== undefined && val !== null) {
            relations[field.name] = val as string | string[];
        }
    }
    return relations;
}

// ============================================================================
// Type-mismatch enforcement helper
// ============================================================================

/**
 * Load an entry through storage (including trashed rows) and assert its type.
 * Throws not-found / type-mismatch the same way the original direct-row helper
 * did. Returns the storage record (locale-enriched Entry for built-in storage).
 */
async function loadAndAssertType(
    storage: EntryStorage,
    type: string,
    id: string
): Promise<Entry> {
    const record = await storage.get(id, { includeTrashed: true });
    if (!record) throw new Error(`Entry '${id}' not found`);
    if (record.type !== undefined && record.type !== type) {
        throw new EntryTypeMismatchError({
            entryId: id,
            expectedType: type,
            actualType: record.type,
        });
    }
    return record as Entry;
}

// ============================================================================
// Bulk dispatch helper
// ============================================================================

async function runBulk<T>(
    type: string,
    ids: readonly string[],
    perId: (storage: EntryStorage, db: StorageDb, id: string) => Promise<T>
): Promise<T[]> {
    if (ids.length === 0) return [];
    const storage = getEntryStorage(type);
    const run = async (txStorage: EntryStorage, db: StorageDb): Promise<T[]> => {
        const results: T[] = [];
        const succeeded: string[] = [];
        for (const id of ids) {
            try {
                results.push(await perId(txStorage, db, id));
                succeeded.push(id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
        return results;
    };
    return storage.transaction ? storage.transaction(run) : run(storage, getDb());
}

async function runBulkVoid(
    type: string,
    ids: readonly string[],
    perId: (storage: EntryStorage, db: StorageDb, id: string) => Promise<void>
): Promise<void> {
    if (ids.length === 0) return;
    await runBulk(type, ids, perId);
}

// ============================================================================
// Internal per-id operations (policy; persistence via storage)
// ============================================================================

async function _updateOne(
    storage: EntryStorage,
    db: StorageDb,
    type: string,
    id: string,
    data: EntryUpdateData
): Promise<Entry> {
    const validatedData = validate(updateEntrySchemaFor(getTitleField(type)), data);
    const currentEntry = await loadAndAssertType(storage, type, id);

    if (isVersioningEnabled(type) && storage.versions) {
        const currentRelations = await buildRelationsSnapshot(db, id);
        const incomingRelations = validatedData.fields
            ? buildIncomingRelations(type, validatedData.fields as JsonObject)
            : currentRelations;

        const titleChanged =
            validatedData.title !== undefined &&
            validatedData.title !== currentEntry.title;
        const slugChanged =
            validatedData.slug !== undefined && validatedData.slug !== currentEntry.slug;
        const fieldsChanged =
            validatedData.fields !== undefined &&
            !deepEqual(currentEntry.fields, validatedData.fields);
        const relationsChanged =
            validatedData.fields !== undefined &&
            !deepEqual(currentRelations, incomingRelations);

        if (titleChanged || slugChanged || fieldsChanged || relationsChanged) {
            const latestNumber = await storage.versions.latestNumber(id);
            await storage.versions.create({
                entryId: id,
                versionNumber: latestNumber + 1,
                title: currentEntry.title,
                slug: currentEntry.slug,
                fields: currentEntry.fields,
                relations: currentRelations,
                createdBy: null,
            });
        }
    }

    let publishedAt = validatedData.publishAt;
    if (validatedData.status === 'published' && !currentEntry.publishedAt) {
        publishedAt = new Date();
    }

    let slug = validatedData.slug;
    if (slug && slug !== currentEntry.slug) {
        slug = await storage.uniqueSlug(type, currentEntry.locale, slug, id);
    }

    const updated = await storage.update(id, {
        title: validatedData.title,
        slug,
        fields: validatedData.fields as JsonObject | undefined,
        status: validatedData.status,
        publishedAt,
    });

    if (validatedData.fields) {
        await saveRelationships(db, updated.id, validatedData.fields as JsonObject, type);
    }

    if (validatedData.fields && storage.translatable) {
        const changedFieldNames = Object.keys(validatedData.fields);
        const nonTranslatableNames = getNonTranslatableFieldNames(
            type,
            changedFieldNames
        );
        if (nonTranslatableNames.length > 0) {
            const nonTranslatableValues: JsonObject = {};
            const fields = validatedData.fields as JsonObject;
            for (const name of nonTranslatableNames) {
                const value = fields[name];
                if (value !== undefined) nonTranslatableValues[name] = value;
            }
            await storage.translatable.propagateFields(
                currentEntry.localeGroup,
                id,
                nonTranslatableValues
            );
        }
    }

    return asEntry(updated);
}

async function _trashOne(
    storage: EntryStorage,
    type: string,
    id: string,
    cascadeLocales: boolean
): Promise<void> {
    await loadAndAssertType(storage, type, id);
    if (!storage.trash) throw new Error(`Entry type "${type}" does not support trash`);
    await storage.trash.trash(id, { cascadeLocales });
}

async function _deleteOne(
    storage: EntryStorage,
    db: StorageDb,
    type: string,
    id: string,
    cascadeLocales: boolean
): Promise<void> {
    const existing = await loadAndAssertType(storage, type, id);
    const relationshipsRepo = new RelationshipsRepository(db);

    if (cascadeLocales && storage.translatable) {
        const siblings = await storage.translatable.siblings(existing.localeGroup, id);
        for (const sib of siblings) {
            await relationshipsRepo.deleteByEntry(sib.id);
        }
        await relationshipsRepo.deleteByEntry(id);
        // Versions cascade-delete via entry_versions.entry_id ON DELETE CASCADE.
        await storage.delete(id, { cascadeLocales: true });
        return;
    }

    await relationshipsRepo.deleteByEntry(id);
    await storage.delete(id);
}

async function _restoreOne(
    storage: EntryStorage,
    type: string,
    id: string
): Promise<Entry> {
    await loadAndAssertType(storage, type, id);
    if (!storage.trash) throw new Error(`Entry type "${type}" does not support trash`);
    return asEntry(await storage.trash.restore(id));
}

// ============================================================================
// Plugin hook helpers
//
// Hooks fire at the public-method level: `before*` before the DB work (a throw
// aborts), `after*` after it completes (post-commit, even for bulk). Snapshots
// for the event context are only loaded when a plugin actually subscribes.
// ============================================================================

function entryHooksActive(...events: string[]): boolean {
    return events.some((event) => hasHookHandlers(event));
}

async function entrySnapshot(type: string, id: string): Promise<Entry> {
    return loadAndAssertType(getEntryStorage(type), type, id);
}

/**
 * Run a trash/delete operation with `entry:beforeDelete`/`entry:afterDelete`
 * hooks. `force` distinguishes permanent delete (true) from trash (false).
 */
async function runDeleteWithHooks(
    type: string,
    id: string | readonly string[],
    force: boolean,
    op: () => Promise<void>
): Promise<void> {
    if (!entryHooksActive('entry:beforeDelete', 'entry:afterDelete')) {
        await op();
        return;
    }
    const user = getCurrentUser();
    const ids = Array.isArray(id) ? Array.from(id) : [id as string];
    const before = await Promise.all(ids.map((entryId) => entrySnapshot(type, entryId)));
    for (const entry of before) {
        await runBeforeHooks('entry:beforeDelete', { type, entry, user, force }, user);
    }
    await op();
    for (const entry of before) {
        await runAfterHooks('entry:afterDelete', { type, entry, user, force }, user);
    }
}

// ============================================================================
// Entries API
// ============================================================================

export const entries: EntriesApi & EntriesStagingApi = {
    async query(
        params: EntryQueryParams & { type: string | readonly string[] }
    ): Promise<QueryResult<Entry>> {
        // Preview (forward versioning): token-authorized read that bypasses the
        // publish gate. Public shape only; diverges enough to take its own path.
        if (params.previewToken) return runPreviewQuery(params);

        const typeParam = params.type;
        const types = Array.isArray(typeParam)
            ? Array.from(typeParam)
            : [typeParam as string];

        // Resolve effective visibility shape.
        // Step 4 will layer client-level defaults; absent `full` ⇒ public is correct here.
        const shape: VisibilityShape = params.full ? 'full' : 'public';

        // Populate only applies when all rows share a single type config.
        const singleType = types.length === 1 ? (types[0] ?? null) : null;
        const firstType = types[0] ?? '';
        const storage = getEntryStorage(firstType);

        const singleTypeCfg = singleType
            ? resolveEntryType(config, singleType)
            : undefined;

        // Open Q1 (pagination correctness): for public shape, push the status
        // predicate into the storage where-clause so DB counts are correct.
        // WhereFilters supports `status: 'published'` (eq). It does NOT support
        // `publishedAt <= now` (no lte operator) — that check stays in applyVisibility.
        // NOTE: scheduled rows with publishedAt <= now will be counted but then
        // filtered in applyVisibility, slightly inflating total/pages when such rows exist.
        // Only push for types that have the statuses capability; tableStorage-backed
        // types (statuses: false) have no publication status column.
        const hasStatuses = singleTypeCfg
            ? singleTypeCfg.capabilities.statuses !== false
            : true;
        const effectiveWhere =
            shape === 'public' && hasStatuses
                ? { ...params.where, status: 'published' }
                : params.where;

        const { data: rows, total } = await storage.list({
            type: singleType ?? types,
            locale: params.locale ?? getDefaultLocale(),
            trashed: params.trashed ?? false,
            search: params.search,
            ...(singleTypeCfg?.search ? { searchFields: singleTypeCfg.search } : {}),
            where: effectiveWhere,
            sort: params.sort,
            page: params.page ?? 1,
            limit: params.limit,
        });

        let data = rows.map(asEntry);

        if (singleType && params.populate && params.populate.length > 0) {
            const entryTypeConfig = resolveEntryType(config, singleType);
            if (entryTypeConfig) {
                data = await populateEntries(
                    getDb(),
                    data,
                    flattenEntryFields(entryTypeConfig.fields),
                    params.populate
                );
            }
        }

        // Apply visibility filter after populate.
        const user = getCurrentUser();
        const audience = { roleSlug: user?.roleSlug ?? null, now: new Date() };

        const visibleData: Entry[] = [];
        for (const entry of data) {
            // Resolve field definitions per row (supports cross-type queries).
            const rowType = entry.type ?? singleType ?? firstType;
            // tableStorage-backed rows have no `type` column, so they come back
            // without a type. Stamp it from the query so every returned entry is
            // complete (consumers build links / resolve icons from `entry.type`).
            if (entry.type === undefined) entry.type = rowType;
            const rowTypeCfg = resolveEntryType(config, rowType);
            const rowFields = rowTypeCfg ? flattenEntryFields(rowTypeCfg.fields) : [];

            // Resolver for populated related entries — look up the related type's fields.
            const resolveRelatedFields = (related: Entry): FieldDefinition[] => {
                const relTypeCfg = resolveEntryType(config, related.type);
                return relTypeCfg ? flattenEntryFields(relTypeCfg.fields) : [];
            };

            const filtered = applyVisibilityWithRelations(
                entry,
                { shape, fields: rowFields, audience },
                resolveRelatedFields
            );

            if (filtered !== null) {
                visibleData.push(shape === 'public' ? markPublic(filtered) : filtered);
            }
        }

        if (params.limit === 'all') {
            return { data: visibleData, pagination: null };
        }

        const perPage = typeof params.limit === 'number' ? params.limit : 20;
        const page = params.page ?? 1;
        const pages = Math.ceil(total / perPage);

        return {
            data: visibleData,
            pagination: { page, limit: perPage, total, pages },
        };
    },

    async get(params: {
        type: string;
        id: string;
        locale?: string;
        populate?: string[];
        full?: boolean;
        previewToken?: string;
        staged?: boolean;
    }): Promise<Entry | null> {
        const { type, id } = params;

        // Preview (forward versioning): token-authorized, publish-gate-bypassed.
        if (params.previewToken) return runPreviewGet(type, id, params);

        const storage = getEntryStorage(type);
        const record = await storage.get(id);

        if (!record) return null;
        if (record.type !== undefined && record.type !== type) return null;

        let result = record as Entry;
        // tableStorage-backed records carry no `type` column — stamp it so the
        // returned entry is complete.
        if (result.type === undefined) result.type = type;

        if (params.populate && params.populate.length > 0) {
            const entryTypeConfig = resolveEntryType(config, type);
            if (entryTypeConfig) {
                const populated = await populateEntries(
                    getDb(),
                    [result],
                    flattenEntryFields(entryTypeConfig.fields),
                    params.populate
                );
                result = populated[0] || result;
            }
        }

        // Apply visibility filter after populate.
        const shape: VisibilityShape = params.full ? 'full' : 'public';
        const user = getCurrentUser();
        const audience = { roleSlug: user?.roleSlug ?? null, now: new Date() };
        const entryTypeCfg = resolveEntryType(config, type);
        const fields = entryTypeCfg ? flattenEntryFields(entryTypeCfg.fields) : [];

        const resolveRelatedFields = (related: Entry): FieldDefinition[] => {
            const relTypeCfg = resolveEntryType(config, related.type);
            return relTypeCfg ? flattenEntryFields(relTypeCfg.fields) : [];
        };

        const filtered = applyVisibilityWithRelations(
            result,
            { shape, fields, audience },
            resolveRelatedFields
        );

        if (filtered === null) return null;

        return shape === 'public' ? markPublic(filtered) : filtered;
    },

    async create(params: {
        type: string;
        title?: string;
        slug?: string;
        locale?: string;
        localeGroup?: string;
        fields?: JsonObject;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<Entry> {
        // Write-back guard: reject public-branded fields objects (defense-in-depth).
        if (params.fields !== undefined && isPublicBranded(params.fields)) {
            throw new PublicShapeWriteError();
        }
        const { type } = params;
        const titleField = getTitleField(type);
        const validated = validate(createEntrySchemaFor(titleField), {
            title: params.title,
            slug: params.slug,
            fields: params.fields,
            status: params.status,
            publishAt: params.publishAt,
        });

        // Titleless types persist `''` rather than undefined (title column is
        // notNull) and never derive a slug from the (absent) title. Titled types
        // are guaranteed a string by the schema; `?? ''` is a no-op narrow there.
        const title = validated.title ?? '';

        const storage = getEntryStorage(type);
        const status = validated.status || 'unpublished';
        const publishedAt =
            status === 'published' ? new Date() : (validated.publishAt ?? null);

        const locale = params.locale ?? getDefaultLocale();
        const localeGroup = params.localeGroup ?? crypto.randomUUID();

        let slug: string | null;
        if (validated.slug) {
            slug = await storage.uniqueSlug(type, locale, validated.slug);
        } else if (titleField === false) {
            // No explicit slug on a titleless type: leave slug null rather than
            // deriving one from the empty title (avoids "-2" style generated slugs).
            slug = null;
        } else {
            slug = await storage.uniqueSlug(type, locale, slugify(title));
        }

        const user = getCurrentUser();
        const createData = {
            title,
            slug,
            locale,
            fields: (validated.fields ?? {}) as JsonObject,
            status,
            publishAt: publishedAt,
        };
        await runBeforeHooks(
            'entry:beforeCreate',
            { type, data: createData, user },
            user
        );

        const created = asEntry(
            await storage.create({
                type,
                title,
                slug,
                locale,
                localeGroup,
                fields: (validated.fields ?? {}) as JsonObject,
                status,
                publishedAt,
            })
        );

        if (validated.fields) {
            await saveRelationships(
                getDb(),
                created.id,
                validated.fields as JsonObject,
                type
            );
        }

        await runAfterHooks(
            'entry:afterCreate',
            { type, data: createData, user, entry: created },
            user
        );
        return created;
    },

    update: (async (params: {
        type: string;
        id: string | readonly string[];
        data: EntryUpdateData;
    }): Promise<Entry | Entry[]> => {
        // Write-back guard: reject public-branded fields (defense-in-depth).
        if (params.data.fields !== undefined && isPublicBranded(params.data.fields)) {
            throw new PublicShapeWriteError();
        }
        const user = getCurrentUser();
        const hooksActive = entryHooksActive('entry:beforeUpdate', 'entry:afterUpdate');
        const storage = getEntryStorage(params.type);

        if (Array.isArray(params.id)) {
            if (params.data.slug !== undefined) {
                throw new Error(
                    'Bulk update cannot set `slug`: a single value across multiple ids ' +
                        'would violate (type, locale) slug uniqueness. Update slugs individually.'
                );
            }
            const before = hooksActive
                ? await Promise.all(params.id.map((id) => entrySnapshot(params.type, id)))
                : [];
            for (const entry of before) {
                await runBeforeHooks(
                    'entry:beforeUpdate',
                    { type: params.type, entry, data: params.data, user },
                    user
                );
            }
            const results = await runBulk(params.type, params.id, (txStorage, txDb, id) =>
                _updateOne(txStorage, txDb, params.type, id, params.data)
            );
            for (const entry of before) {
                await runAfterHooks(
                    'entry:afterUpdate',
                    { type: params.type, entry, data: params.data, user },
                    user
                );
            }
            return results;
        }

        const id = params.id as string;
        const before = hooksActive ? await entrySnapshot(params.type, id) : null;
        if (before) {
            await runBeforeHooks(
                'entry:beforeUpdate',
                { type: params.type, entry: before, data: params.data, user },
                user
            );
        }
        const updated = await _updateOne(storage, getDb(), params.type, id, params.data);
        if (before) {
            await runAfterHooks(
                'entry:afterUpdate',
                { type: params.type, entry: before, data: params.data, user },
                user
            );
        }
        return updated;
    }) as EntriesApi['update'],

    async duplicate(params: {
        type: string;
        id: string;
        overrides?: EntryDuplicateOverrides;
    }): Promise<Entry> {
        const { type, id, overrides } = params;
        const storage = getEntryStorage(type);
        const source = await loadAndAssertType(storage, type, id);

        const locale = overrides?.locale ?? source.locale;
        const localeGroup = overrides?.localeGroup ?? crypto.randomUUID();
        const status = overrides?.status ?? 'unpublished';
        const title = overrides?.title ?? source.title;
        const mergedFields: JsonObject = {
            ...(source.fields ?? {}),
            ...(overrides?.fields ?? {}),
        };

        const baseSlug = overrides?.slug ?? source.slug;
        const slug = baseSlug ? await storage.uniqueSlug(type, locale, baseSlug) : null;

        const created = await storage.create({
            type,
            title,
            slug,
            locale,
            localeGroup,
            fields: mergedFields,
            status,
            publishedAt: status === 'published' ? new Date() : null,
        });

        const relationshipsRepo = new RelationshipsRepository(getDb());
        const originalRels = await relationshipsRepo.getBySource(id, 'entry');

        for (const rel of originalRels) {
            await relationshipsRepo.create({
                sourceId: created.id,
                sourceType: 'entry',
                name: rel.name,
                targetId: rel.targetId,
                targetType: rel.targetType,
                position: rel.position,
            });
        }

        return asEntry(created);
    },

    async trash(params: {
        type: string;
        id: string | readonly string[];
        cascadeLocales?: boolean;
    }): Promise<void> {
        assertCapability(params.type, 'trash');
        const cascade = !!params.cascadeLocales;
        await runDeleteWithHooks(params.type, params.id, false, async () => {
            if (Array.isArray(params.id)) {
                await runBulkVoid(params.type, params.id, (txStorage, _txDb, id) =>
                    _trashOne(txStorage, params.type, id, cascade)
                );
                return;
            }
            await _trashOne(
                getEntryStorage(params.type),
                params.type,
                params.id as string,
                cascade
            );
        });
    },

    restore: (async (params: {
        type: string;
        id: string | readonly string[];
    }): Promise<Entry | Entry[]> => {
        assertCapability(params.type, 'trash');
        if (Array.isArray(params.id)) {
            return runBulk(params.type, params.id, (txStorage, _txDb, id) =>
                _restoreOne(txStorage, params.type, id)
            );
        }
        return _restoreOne(
            getEntryStorage(params.type),
            params.type,
            params.id as string
        );
    }) as EntriesApi['restore'],

    async delete(params: {
        type: string;
        id: string | readonly string[];
        cascadeLocales?: boolean;
    }): Promise<void> {
        const cascade = !!params.cascadeLocales;
        await runDeleteWithHooks(params.type, params.id, true, async () => {
            if (Array.isArray(params.id)) {
                await runBulkVoid(params.type, params.id, (txStorage, txDb, id) =>
                    _deleteOne(txStorage, txDb, params.type, id, cascade)
                );
                return;
            }
            await _deleteOne(
                getEntryStorage(params.type),
                getDb(),
                params.type,
                params.id as string,
                cascade
            );
        });
    },

    async emptyTrash(params: { type: string }): Promise<void> {
        assertCapability(params.type, 'trash');
        const { type } = params;
        const storage = getEntryStorage(type);
        if (!storage.trash)
            throw new Error(`Entry type "${type}" does not support trash`);

        // Clean up relationship rows for the soon-to-be-deleted trashed entries.
        const { data: trashed } = await storage.list({
            type,
            locale: 'all',
            trashed: true,
            limit: 'all',
        });
        const relationshipsRepo = new RelationshipsRepository(getDb());
        for (const entry of trashed) {
            await relationshipsRepo.deleteByEntry(entry.id);
        }

        await storage.trash.emptyTrash(type);
    },

    async versions(params: { type: string; id: string }): Promise<EntryVersion[]> {
        const storage = getEntryStorage(params.type);
        await loadAndAssertType(storage, params.type, params.id);
        if (!storage.versions) return [];
        return storage.versions.list(params.id);
    },

    async restoreVersion(params: {
        type: string;
        id: string;
        versionId: string;
    }): Promise<Entry> {
        const { type, id, versionId } = params;
        const storage = getEntryStorage(type);
        if (!storage.versions) throw new Error('Version not found');

        const version = await storage.versions.get(versionId);
        if (!version || version.entryId !== id) {
            throw new Error('Version not found');
        }

        const currentEntry = await loadAndAssertType(storage, type, id);

        const currentRelations = await buildRelationsSnapshot(getDb(), id);
        const latestNumber = await storage.versions.latestNumber(id);
        await storage.versions.create({
            entryId: id,
            versionNumber: latestNumber + 1,
            title: currentEntry.title,
            slug: currentEntry.slug,
            fields: currentEntry.fields,
            relations: currentRelations,
            createdBy: null,
        });

        let slug = version.slug;
        if (slug && slug !== currentEntry.slug) {
            slug = await storage.uniqueSlug(type, currentEntry.locale, slug, id);
        }

        const updated = await storage.update(id, {
            title: version.title,
            slug: slug ?? currentEntry.slug,
            fields: (version.fields as JsonObject) ?? currentEntry.fields,
        });

        if (version.relations) {
            const relRepo = new RelationshipsRepository(getDb());
            for (const [fieldName, targetIds] of Object.entries(
                version.relations as Record<string, unknown>
            )) {
                const ids = Array.isArray(targetIds)
                    ? (targetIds as string[])
                    : [targetIds as string];
                const entryTypeConfig = resolveEntryType(config, type);
                let targetType: 'entry' | 'user' | 'media' = 'entry';
                if (entryTypeConfig) {
                    const field = flattenEntryFields(entryTypeConfig.fields).find(
                        (f) => f.name === fieldName
                    );
                    if (field?.type === 'relationship' && field.target === 'users') {
                        targetType = 'user';
                    }
                }
                await relRepo.replaceAll(id, 'entry', fieldName, ids, targetType);
            }
        }

        return asEntry(updated);
    },

    async incomingRelations(params: {
        type: string;
        id: string;
    }): Promise<IncomingRelation[]> {
        const storage = getEntryStorage(params.type);
        await loadAndAssertType(storage, params.type, params.id);
        const relRepo = new RelationshipsRepository(getDb());
        const rels = await relRepo.getByTarget(params.id, 'entry');
        const entryRels = rels.filter((r) => r.sourceType === 'entry');
        if (entryRels.length === 0) return [];

        const sourceIds = Array.from(new Set(entryRels.map((r) => r.sourceId)));
        const sources = await Promise.all(
            sourceIds.map((sourceId) => storage.get(sourceId, { includeTrashed: true }))
        );

        const byId = new Map(
            sources.filter((s): s is Entry => s !== null).map((s) => [s.id, s])
        );
        return entryRels
            .map((rel) => {
                const src = byId.get(rel.sourceId);
                if (!src) return null;
                return {
                    sourceId: src.id,
                    sourceTitle: src.title,
                    sourceType: src.type,
                    name: rel.name,
                } satisfies IncomingRelation;
            })
            .filter((x): x is IncomingRelation => x !== null);
    },

    publish: (async (params: {
        type: string;
        id: string | readonly string[];
    }): Promise<Entry | Entry[]> => {
        assertCapability(params.type, 'statuses');
        return entries.update({
            type: params.type,
            id: params.id,
            data: { status: 'published', publishAt: null },
        } as Parameters<EntriesApi['update']>[0]);
    }) as EntriesApi['publish'],

    unpublish: (async (params: {
        type: string;
        id: string | readonly string[];
    }): Promise<Entry | Entry[]> => {
        assertCapability(params.type, 'statuses');
        return entries.update({
            type: params.type,
            id: params.id,
            data: { status: 'unpublished', publishAt: null },
        } as Parameters<EntriesApi['update']>[0]);
    }) as EntriesApi['unpublish'],

    schedule: (async (params: {
        type: string;
        id: string | readonly string[];
        publishAt: Date;
    }): Promise<Entry | Entry[]> => {
        assertCapability(params.type, 'statuses');
        const validated = validate(scheduleEntrySchema, { publishAt: params.publishAt });
        return entries.update({
            type: params.type,
            id: params.id,
            data: { status: 'scheduled', publishAt: validated.publishAt },
        } as Parameters<EntriesApi['update']>[0]);
    }) as EntriesApi['schedule'],

    // ========================================================================
    // Forward versioning (staged entries)
    // ========================================================================

    async createStaged(params: { type: string; id: string }): Promise<Entry> {
        const { type, id } = params;
        const { storage, staging } = getStagingStorage(type);
        const canonical = await loadAndAssertType(storage, type, id);
        if (canonical.stagedFor != null) {
            throw new Error(
                `Entry '${id}' is itself a staged change and cannot be staged.`
            );
        }

        const existing = await staging.getByCanonical(id);
        if (existing) {
            throw new StagedEntryExistsError({ canonicalId: id, stagedId: existing.id });
        }

        // A staged row copies the canonical's content but gets a FRESH localeGroup
        // (it does not join the canonical's translation group) and is always
        // unpublished. The slug is shared with the canonical (kept as-is).
        const created = await storage.create({
            type,
            title: canonical.title,
            slug: canonical.slug,
            locale: canonical.locale,
            localeGroup: crypto.randomUUID(),
            fields: canonical.fields,
            status: 'unpublished',
            stagedFor: id,
            publishedAt: null,
        });

        const relRepo = new RelationshipsRepository(getDb());
        const canonicalRels = await relRepo.getBySource(id, 'entry');
        for (const rel of canonicalRels) {
            await relRepo.create({
                sourceId: created.id,
                sourceType: 'entry',
                name: rel.name,
                targetId: rel.targetId,
                targetType: rel.targetType,
                position: rel.position,
            });
        }

        return asEntry(created);
    },

    async getStaged(params: { type: string; id: string }): Promise<Entry | null> {
        const { type, id } = params;
        const { storage, staging } = getStagingStorage(type);
        await loadAndAssertType(storage, type, id);
        const staged = await staging.getByCanonical(id);
        return staged ? asEntry(staged) : null;
    },

    async mergeStaged(params: { type: string; id: string }): Promise<Entry> {
        const { type, id } = params;
        const { storage, staging } = getStagingStorage(type);
        const canonical = await loadAndAssertType(storage, type, id);
        const staged = await staging.getByCanonical(id);
        if (!staged) throw new Error(`No staged change for entry '${id}'`);

        const versioningOn = isVersioningEnabled(type);

        const run = async (txStorage: EntryStorage, txDb: StorageDb): Promise<Entry> => {
            // 1. Backup (conditional on versioning): snapshot the canonical first so
            //    a partial failure leaves a recoverable version.
            if (versioningOn && txStorage.versions) {
                const currentRelations = await buildRelationsSnapshot(txDb, id);
                const latestNumber = await txStorage.versions.latestNumber(id);
                await txStorage.versions.create({
                    entryId: id,
                    versionNumber: latestNumber + 1,
                    title: canonical.title,
                    slug: canonical.slug,
                    fields: canonical.fields,
                    relations: currentRelations,
                    createdBy: null,
                });
            }

            // 2. Update the canonical row in place (id + slug preserved → external
            //    refs stable) with the staged content. Status is intentionally
            //    left untouched: merging is content-only — publishing (or not) is
            //    a separate action, so an unpublished canonical stays unpublished.
            const updated = await txStorage.update(id, {
                title: staged.title,
                fields: staged.fields,
            });

            // Replace the canonical's relations wholesale with the staged ones.
            const relRepo = new RelationshipsRepository(txDb);
            await relRepo.deleteByEntry(id);
            const stagedRels = await relRepo.getBySource(staged.id, 'entry');
            for (const rel of stagedRels) {
                await relRepo.create({
                    sourceId: id,
                    sourceType: 'entry',
                    name: rel.name,
                    targetId: rel.targetId,
                    targetType: rel.targetType,
                    position: rel.position,
                });
            }

            // 3. Cleanup: hard-delete the staged entry (its versions cascade; its
            //    relationship rows are not FK-bound, so drop them explicitly).
            await relRepo.deleteByEntry(staged.id);
            await txStorage.delete(staged.id);

            return asEntry(updated);
        };

        return storage.transaction ? storage.transaction(run) : run(storage, getDb());
    },

    async deleteStaged(params: { type: string; id: string }): Promise<void> {
        const { type, id } = params;
        const { storage, staging } = getStagingStorage(type);
        await loadAndAssertType(storage, type, id);
        const staged = await staging.getByCanonical(id);
        if (!staged) throw new Error(`No staged change for entry '${id}'`);
        const relRepo = new RelationshipsRepository(getDb());
        await relRepo.deleteByEntry(staged.id);
        await storage.delete(staged.id);
    },

    async issuePreviewToken(params: {
        type: string;
        id: string;
        expiresAt?: Date | null;
    }): Promise<{ token: string }> {
        const { type, id } = params;
        assertCapability(type, 'staging');
        const storage = getEntryStorage(type);
        const canonical = await loadAndAssertType(storage, type, id);
        if (canonical.stagedFor != null) {
            throw new Error(
                `Entry '${id}' is a staged change; issue the preview token on its canonical entry.`
            );
        }
        const token = generatePreviewSecret();
        const hash = await hashPreviewToken(token);
        const user = getCurrentUser();
        await new PreviewTokensRepository(getDb()).issue(
            id,
            hash,
            params.expiresAt ?? null,
            user?.id ?? null
        );
        return { token };
    },

    async revokePreviewToken(params: { type: string; id: string }): Promise<void> {
        const { type, id } = params;
        assertCapability(type, 'staging');
        const storage = getEntryStorage(type);
        await loadAndAssertType(storage, type, id);
        await new PreviewTokensRepository(getDb()).revoke(id);
    },
};
