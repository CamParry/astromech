import { z } from 'zod';
import type { UserRow } from './schema.js';
import { createUserStorage } from './storage.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import type { RelationshipIndexSource } from '@/database/storage/relationships.js';
import { collectRelationshipEdges } from '@/fields/relationship-edges.js';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations.js';
import type { JsonObject, User, QueryResult, UserQueryParams } from '@/types/index.js';
import { ValidationError } from '@/errors/validation.js';
import { createUserSchema, updateUserSchema } from './schema.js';
import config from 'virtual:astromech/config';
import { processFields } from '@/fields/pipeline.js';
import { mergePatch, projectToSchema } from '@/fields/values.js';
import { getResourceValidator } from '@/fields/resource-validators.js';
import { flattenFieldNodes } from '@/fields/flatten.js';
import { fieldReadsFromRecords } from '@/fields/field-reads.js';
import { getCurrentUser } from '@/request-context/index.js';

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (err) {
        if (err instanceof z.ZodError) throw new ValidationError(err.issues);
        throw err;
    }
}

function toUser(row: UserRow): User {
    return {
        ...row,
        fields: (row.fields as JsonObject | null) ?? null,
        roleSlug: row.roleSlug,
    };
}

export const usersService = {
    async query(params?: UserQueryParams): Promise<QueryResult<User>> {
        const storage = createUserStorage();
        const page = params?.page ?? 1;
        const limit = params?.limit;

        if (limit === 'all') {
            const rows = await storage.list({
                search: params?.search,
                sort: params?.sort,
            });
            return { data: rows.map(toUser), pagination: null };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const [rows, total] = await Promise.all([
            storage.list({
                search: params?.search,
                sort: params?.sort,
                limit: perPage,
                offset,
            }),
            storage.count({ search: params?.search }),
        ]);

        return {
            data: rows.map(toUser),
            pagination: {
                page,
                limit: perPage,
                total,
                pages: Math.ceil(total / perPage),
            },
        };
    },

    async get(params: { id: string }): Promise<User | null> {
        const row = await createUserStorage().get(params.id);
        return row ? toUser(row) : null;
    },

    async create(params: {
        email: string;
        name: string;
        fields?: JsonObject;
        roleSlug?: string;
    }): Promise<User> {
        const validated = validate(createUserSchema, params);

        const fieldDefs = flattenFieldNodes(config.users?.fields ?? []);
        // Registry first: the Astro config is JSON, so an authored `validate`
        // only survives boot's registration. The config value is the fallback
        // for the live-config paths (CLI, tests).
        const documentValidate = getResourceValidator('users') ?? config.users?.validate;
        const processedFields = await processFields(
            (validated.fields ?? {}) as Record<string, unknown>,
            fieldDefs,
            {
                operation: 'create',
                host: { kind: 'user', record: null },
                user: getCurrentUser(),
                reads: fieldReadsFromRecords({
                    load: async () => (await usersService.query({ limit: 'all' })).data,
                    getId: (r) => r.id,
                    getFields: (r) => (r.fields ?? {}) as Record<string, unknown>,
                }),
                ...(documentValidate ? { documentValidate } : {}),
            }
        );
        if (
            Object.keys(processedFields.errors).length > 0 ||
            processedFields.form.length > 0
        ) {
            throw ValidationError.fromFieldErrors(
                processedFields.errors,
                processedFields.form
            );
        }
        // After `processFields` (its minted item ids are what the traversal
        // needs) and before the write, so the index derives from pruned values.
        const { values: fields } = await pruneDanglingRelations(
            fieldDefs,
            processedFields.values as JsonObject
        );

        const created = await createUserStorage().create({
            email: validated.email,
            name: validated.name,
            ...(Object.keys(fields).length > 0 && { fields }),
            roleSlug: validated.roleSlug,
        });
        await indexUserRelationships(created.id, fields);
        return toUser(created);
    },

    async update(params: {
        id: string;
        data: Partial<{
            name: string;
            email: string;
            fields: JsonObject;
            roleSlug: string;
        }>;
    }): Promise<User> {
        const { id } = params;
        const validatedData = validate(updateUserSchema, params.data);

        if (validatedData.fields !== undefined) {
            const current = await usersService.get({ id });
            const fieldDefs = flattenFieldNodes(config.users?.fields ?? []);
            // Registry first: the Astro config is JSON, so an authored
            // `validate` only survives boot's registration. The config value is
            // the fallback for the live-config paths (CLI, tests).
            const documentValidate =
                getResourceValidator('users') ?? config.users?.validate;
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
                host: { kind: 'user', record: current },
                user: getCurrentUser(),
                reads: fieldReadsFromRecords({
                    load: async () => (await usersService.query({ limit: 'all' })).data,
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
            // After `processFields`, before the write — same ordering as create.
            const pruned = await pruneDanglingRelations(
                fieldDefs,
                projectToSchema(processed.values, fieldDefs) as JsonObject
            );
            validatedData.fields = pruned.values;
        }

        // An explicitly-`undefined` key means "leave this column alone"; storage
        // stamps `updatedAt`.
        const updated = await createUserStorage().update(id, {
            name: validatedData.name,
            email: validatedData.email,
            fields: validatedData.fields as JsonObject | undefined,
            roleSlug: validatedData.roleSlug,
        });
        // An update that never touched `fields` must leave the index alone.
        if (validatedData.fields !== undefined) {
            await indexUserRelationships(id, validatedData.fields as JsonObject);
        }
        return toUser(updated);
    },

    async delete(params: { id: string }): Promise<void> {
        await createUserStorage().delete(params.id);
    },
};

/**
 * Every user as a relationship source, with the edges its STORED field data
 * holds. The rebuild side of `indexUserRelationships`. Stored data has already
 * been through `processFields`, so the traversal mints no ids here.
 */
export async function collectUserRelationshipSources(): Promise<
    RelationshipIndexSource[]
> {
    const definitions = flattenFieldNodes(config.users?.fields ?? []);
    const rows = await createUserStorage().list();
    return rows.map((row) => ({
        source: { id: row.id, kind: 'user' as const },
        edges: collectRelationshipEdges(
            definitions,
            (row.fields ?? {}) as unknown as JsonObject
        ),
    }));
}

/**
 * Re-index a user's relationship fields. `fields` must be post-`processFields`
 * values — item ids are minted during that pass.
 */
async function indexUserRelationships(id: string, fields: JsonObject): Promise<void> {
    const definitions = flattenFieldNodes(config.users?.fields ?? []);
    await createRelationshipStorage().replaceForSource(
        { id, kind: 'user' },
        collectRelationshipEdges(definitions, fields)
    );
}
