import { z } from 'zod';
import { ulid } from 'ulidx';
import type { MediaRow } from './schema.js';
import { createMediaStorage } from './storage.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import type { RelationshipIndexSource } from '@/database/storage/relationships.js';
import type { RelationshipRow } from '@/database/schema.js';
// Peer domains, read only to name a source row. See the `usedBy` docstring.
import { getEntryStorage } from '@/entries/storage/registry.js';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations.js';
import { createUserStorage } from '@/users/storage.js';
import { collectRelationshipEdges } from '@/fields/relationship-edges.js';
import { getStorageDriver } from '@/storage/registry.js';
import { deletePrefix } from '@/storage/prefix.js';
import type {
    Media,
    JsonObject,
    QueryResult,
    MediaQueryParams,
    MediaMetadata,
    MediaUsage,
    StorageDriver,
} from '@/types/index.js';
import { ValidationError } from '@/errors/validation.js';
import { updateMediaSchema } from './schema.js';
import { processFields } from '@/fields/pipeline.js';
import { mergePatch, projectToSchema } from '@/fields/patch.js';
import { getDocumentValidator } from '@/fields/document-validators.js';
import { flattenFieldNodes } from '@/fields/helpers.js';
import { scopedReadsFromRecords } from '@/fields/scoped-reads.js';
import { getCurrentUser } from '@/context/index.js';
import { buildMediaUrl, variantPrefix } from './serving/image/url.js';
import { isOptimisableImage, readImageDimensions } from './serving/image/dimensions.js';
import { contentVersion } from './serving/image/version.js';
import { getImageConfig } from './serving/image/registry.js';
import config from 'virtual:astromech/config';

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (err) {
        if (err instanceof z.ZodError) throw new ValidationError(err.issues);
        throw err;
    }
}

/** File extension (without the dot), or '' when the filename has none. */
function extOf(filename: string): string {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i + 1) : '';
}

/** Storage key for an original, derived from the record (never from a URL). */
function originalKey(id: string, filename: string): string {
    const ext = extOf(filename);
    return ext ? `${id}.${ext}` : id;
}

/**
 * Resolve the delivery URL for a media record — the one place the `media.access`
 * policy is applied, because `toMedia` is the one place a `Media.url` is made.
 *
 * `access: 'public'` prefers the driver's own URL; anything else (and any driver
 * without one) falls back to the proxying media route, which is what keeps
 * `filesystem()` in dev and `r2()` without a `publicUrl` working unchanged.
 *
 * A public URL must be PERMANENT. Astro bakes these into static HTML at build
 * time, and the same strings end up in `og:image`, RSS and email — so nothing
 * expiring may ever be returned from here. That is why presigned URLs are an
 * upload path, not the delivery path.
 */
function resolveMediaUrl(id: string, filename: string): string {
    if (config.media.access === 'public') {
        // Optional capability, genuinely absent on some drivers — feature-detect.
        const publicUrl =
            getStorageDriver().getPublicUrl?.(originalKey(id, filename)) ?? null;
        if (publicUrl !== null) return publicUrl;
    }
    return buildMediaUrl(config.mediaRoute, id, extOf(filename));
}

function toMedia(row: MediaRow): Media {
    return {
        ...row,
        url: resolveMediaUrl(row.id, row.filename),
    } as Media;
}

/**
 * Store an uploaded file under `key` and extract image metadata.
 *
 * Optimisable images are buffered once — their bytes are needed for dimension
 * extraction, the blurhash placeholder, and the content-hash version. Every
 * other type (video, PDF, …) is streamed straight to storage and never buffered
 * (the "stream, never buffer" abuse guard, spec §8).
 */
async function storeFile(
    driver: StorageDriver,
    key: string,
    file: File
): Promise<{ width: number | null; height: number | null; metadata: MediaMetadata }> {
    if (isOptimisableImage(file.type)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const dims = readImageDimensions(bytes);
        const blurhash = (await getImageConfig()?.driver.placeholder?.(bytes)) ?? null;
        const version = await contentVersion(bytes);
        await driver.put(key, bytes, { contentType: file.type });
        return {
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            metadata: { blurhash, version },
        };
    }

    await driver.put(key, file.stream(), { contentType: file.type });
    return { width: null, height: null, metadata: {} };
}

export const mediaApi = {
    async query(params?: MediaQueryParams): Promise<QueryResult<Media>> {
        const storage = createMediaStorage();
        const page = params?.page ?? 1;
        const limit = params?.limit;

        if (limit === 'all') {
            const rows = await storage.list(params);
            return { data: rows.map(toMedia), pagination: null };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const [rows, total] = await Promise.all([
            storage.list(params, { limit: perPage, offset }),
            storage.count(params),
        ]);

        return {
            data: rows.map(toMedia),
            pagination: {
                page,
                limit: perPage,
                total,
                pages: Math.ceil(total / perPage),
            },
        };
    },

    async get(params: { id: string }): Promise<Media | null> {
        const row = await createMediaStorage().get(params.id);
        return row ? toMedia(row) : null;
    },

    async upload(params: { file: File }): Promise<Media> {
        const { file } = params;
        const driver = getStorageDriver();

        // Minted here rather than left to the descriptor's `col.id()` default:
        // the storage key is derived from the id and the bytes are written
        // BEFORE the row is inserted, so the id has to exist first. `ulid()` is
        // the same generator the descriptor default uses, so an explicit mint
        // agrees with the column instead of fighting it.
        const id = ulid();
        const ext = extOf(file.name);
        const key = ext ? `${id}.${ext}` : id;

        const { width, height, metadata } = await storeFile(driver, key, file);

        return toMedia(
            await createMediaStorage().create({
                id,
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                width,
                height,
                metadata,
            })
        );
    },

    async update(params: {
        id: string;
        data: Partial<{ alt: string; title: string; fields: JsonObject }>;
    }): Promise<Media> {
        const { id } = params;
        const validatedData = validate(updateMediaSchema, params.data);

        if (validatedData.fields !== undefined) {
            const current = await mediaApi.get({ id });
            const fieldDefs = flattenFieldNodes(config.media?.fields ?? []);
            // Registry first: the Astro config is JSON, so an authored
            // `validate` only survives boot's registration. The config value is
            // the fallback for the live-config paths (CLI, tests).
            const documentValidate =
                getDocumentValidator('media') ?? config.media?.validate;
            // `fields` is a patch: an omitted field keeps its stored value, an
            // explicit `null` stores null, and a container replaces wholesale.
            const patch = validatedData.fields as Record<string, unknown>;
            const patchedNames = Object.keys(patch).filter((k) => patch[k] !== undefined);
            const merged = mergePatch(
                current?.fields as Record<string, unknown> | null | undefined,
                patch
            );
            const processed = await processFields(merged, fieldDefs, {
                operation: 'update',
                host: { kind: 'media', record: current },
                user: getCurrentUser(),
                reads: scopedReadsFromRecords({
                    load: async () => (await mediaApi.query({ limit: 'all' })).data,
                    getId: (r) => r.id,
                    getFields: (r) => (r.fields ?? {}) as Record<string, unknown>,
                    excludeId: id,
                }),
                coerceOnly: new Set(patchedNames),
                ...(documentValidate ? { documentValidate } : {}),
            });
            if (Object.keys(processed.errors).length > 0 || processed.form.length > 0) {
                throw ValidationError.fromFieldErrors(processed.errors, processed.form);
            }
            // After `processFields` (its minted item ids are what the traversal
            // needs) and before the write, so the index derives from the pruned
            // values.
            const pruned = await pruneDanglingRelations(
                fieldDefs,
                projectToSchema(processed.values, fieldDefs) as JsonObject
            );
            validatedData.fields = pruned.values;
        }

        // `updatedAt` is stamped by the storage wrapper (the column declares
        // `onUpdate`); an explicitly-`undefined` key means "leave this column alone".
        const updated = await createMediaStorage().update(id, {
            alt: validatedData.alt,
            fields: validatedData.fields as JsonObject | undefined,
        });
        // An update that never touched `fields` must leave the index alone.
        if (validatedData.fields !== undefined) {
            await indexMediaRelationships(id, validatedData.fields as JsonObject);
        }
        return toMedia(updated);
    },

    async delete(params: { id: string }): Promise<void> {
        const { id } = params;
        const storage = createMediaStorage();
        const driver = getStorageDriver();

        const row = await storage.get(id);
        if (row) {
            const ext = extOf(row.filename);
            const key = ext ? `${row.id}.${ext}` : row.id;
            await driver.delete(key);
            await deletePrefix(driver, variantPrefix(id));
        }

        await storage.delete(id);
    },

    async replace(params: { id: string; file: File }): Promise<Media> {
        const { id, file } = params;
        const storage = createMediaStorage();
        const driver = getStorageDriver();

        const row = await storage.get(id);
        if (!row) throw new Error(`Media '${id}' not found`);

        const newExt = extOf(file.name);
        const newKey = newExt ? `${id}.${newExt}` : id;
        const oldExt = extOf(row.filename);
        const oldKey = oldExt ? `${id}.${oldExt}` : id;

        const { width, height, metadata } = await storeFile(driver, newKey, file);

        // Drop the previous original when the extension (hence key) changed, so a
        // cross-extension replace doesn't leave the old bytes orphaned.
        if (oldKey !== newKey) {
            await driver.delete(oldKey);
        }
        await deletePrefix(driver, variantPrefix(id));

        return toMedia(
            await storage.update(id, {
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                width,
                height,
                metadata,
            })
        );
    },

    /**
     * Every relationships-index edge pointing at this media item — one row per
     * edge, so a source using the same file at two paths yields two rows.
     *
     * Titles resolve here rather than in the admin, so this returns the same
     * shape as `entries.incomingRelations`. Two wire shapes for "what
     * references this" is the split worth avoiding; reading a peer domain to
     * name a row is not.
     */
    async usedBy(params: { id: string }): Promise<MediaUsage[]> {
        const { id } = params;
        const row = await createMediaStorage().get(id);
        if (!row) throw new Error(`Media '${id}' not found`);

        // Staged sources count: a pending merge that uses this file is a reason
        // not to delete it.
        const rows = await createRelationshipStorage().findByTarget(id, 'media', {
            includeStaged: true,
        });

        const titles = await resolveSourceTitles(rows);
        return rows
            .map(
                (edge): MediaUsage => ({
                    sourceId: edge.sourceId,
                    sourceKind: edge.sourceKind,
                    sourceType: edge.sourceType,
                    sourceTitle: titles.get(sourceTitleKey(edge)) ?? '',
                    schemaPath: edge.schemaPath,
                    instancePath: edge.instancePath,
                    sourceStaged: edge.sourceStaged,
                })
            )
            .sort(compareUsage);
    },
};

/**
 * Display name per source, keyed by kind+id. Entry sources load through their
 * OWN type's storage — the target's storage would silently miss every source of
 * another type. A source that will not load keeps an empty title and the caller
 * falls back to its id.
 */
async function resolveSourceTitles(
    rows: readonly RelationshipRow[]
): Promise<Map<string, string>> {
    const titles = new Map<string, string>();

    const entryIdsByType = new Map<string, Set<string>>();
    const userIds = new Set<string>();
    const mediaIds = new Set<string>();
    for (const row of rows) {
        if (row.sourceKind === 'user') userIds.add(row.sourceId);
        else if (row.sourceKind === 'media') mediaIds.add(row.sourceId);
        else if (row.sourceType !== null) {
            const ids = entryIdsByType.get(row.sourceType) ?? new Set<string>();
            ids.add(row.sourceId);
            entryIdsByType.set(row.sourceType, ids);
        }
    }

    for (const [type, ids] of entryIdsByType) {
        // A type dropped from config since its rows were written has no storage.
        let storage;
        try {
            storage = getEntryStorage(type);
        } catch {
            continue;
        }
        const records = await Promise.all(
            Array.from(ids, (entryId) => storage.get(entryId, { includeTrashed: true }))
        );
        for (const record of records) {
            if (record !== null) titles.set(`entry ${record.id}`, record.title ?? '');
        }
    }

    const userStorage = createUserStorage();
    for (const userId of userIds) {
        const user = await userStorage.get(userId);
        if (user !== null) titles.set(`user ${userId}`, user.name || user.email);
    }

    const mediaStorage = createMediaStorage();
    for (const mediaId of mediaIds) {
        const item = await mediaStorage.get(mediaId);
        if (item !== null) titles.set(`media ${mediaId}`, item.filename);
    }

    return titles;
}

/** Kind+id, NUL-joined so no id can spell another kind's key. */
function sourceTitleKey(row: { sourceKind: string; sourceId: string }): string {
    return `${row.sourceKind} ${row.sourceId}`;
}

/** Stable panel order: the index itself has none, so reads would reshuffle. */
function compareUsage(a: MediaUsage, b: MediaUsage): number {
    return (
        a.sourceKind.localeCompare(b.sourceKind) ||
        (a.sourceType ?? '').localeCompare(b.sourceType ?? '') ||
        a.sourceId.localeCompare(b.sourceId) ||
        a.schemaPath.localeCompare(b.schemaPath) ||
        a.instancePath.localeCompare(b.instancePath)
    );
}

/**
 * Every media record as a relationship source, with the edges its STORED field
 * data holds. The rebuild side of `indexMediaRelationships`. Stored data has
 * already been through `processFields`, so the traversal mints no ids here.
 */
export async function collectMediaRelationshipSources(): Promise<
    RelationshipIndexSource[]
> {
    const definitions = flattenFieldNodes(config.media?.fields ?? []);
    const rows = await createMediaStorage().list();
    return rows.map((row) => ({
        source: { id: row.id, kind: 'media' as const },
        edges: collectRelationshipEdges(definitions, (row.fields ?? {}) as JsonObject),
    }));
}

/**
 * Re-index a media record's relationship fields. `fields` must be
 * post-`processFields` values — item ids are minted during that pass.
 */
async function indexMediaRelationships(id: string, fields: JsonObject): Promise<void> {
    const definitions = flattenFieldNodes(config.media?.fields ?? []);
    await createRelationshipStorage().replaceForSource(
        { id, kind: 'media' },
        collectRelationshipEdges(definitions, fields)
    );
}
