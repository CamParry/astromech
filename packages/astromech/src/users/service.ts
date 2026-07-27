import type { Insertable, Updateable, ExpressionBuilder } from 'kysely';
import { z } from 'zod';
import type { UserRow } from './schema.js';
import { getDb } from '@/database/registry.js';
import type { DB } from '@/database/types.js';
import { encode, encodePatch, decode } from '@/database/codec.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import type {
    JsonObject,
    User,
    QueryResult,
    UserQueryParams,
    SortOption,
} from '@/types/index.js';
import { ValidationError } from '@/errors/validation.js';
import { createUserSchema, updateUserSchema } from './schema.js';
import config from 'virtual:astromech/config';
import { processFields } from '@/fields/pipeline.js';
import { flattenFieldNodes } from '@/fields/helpers.js';
import { scopedReadsFromRecords } from '@/fields/scoped-reads.js';
import { getCurrentUser } from '@/context/index.js';

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

const SORTABLE_COLS = ['name', 'email', 'createdAt', 'updatedAt', 'roleSlug'] as const;
type SortableCol = (typeof SORTABLE_COLS)[number];

function isSortableCol(s: string): s is SortableCol {
    return (SORTABLE_COLS as readonly string[]).includes(s);
}

function buildOrderBy(
    sort?: SortOption | SortOption[]
): { col: SortableCol; dir: 'asc' | 'desc' }[] {
    if (!sort) return [{ col: 'name', dir: 'asc' }];
    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses = sorts.flatMap((s) =>
        Object.entries(s).flatMap(([field, dir]) => {
            if (!isSortableCol(field)) return [];
            return [{ col: field, dir: dir as 'asc' | 'desc' }];
        })
    );
    return clauses.length > 0 ? clauses : [{ col: 'name', dir: 'asc' }];
}

function buildUsersWhere(eb: ExpressionBuilder<DB, 'users'>, search?: string) {
    if (!search) return undefined;
    return eb.or([eb('name', 'like', `%${search}%`), eb('email', 'like', `%${search}%`)]);
}

export const usersApi = {
    async query(params?: UserQueryParams): Promise<QueryResult<User>> {
        const db = getDb();
        const page = params?.page ?? 1;
        const limit = params?.limit;
        const orderClauses = buildOrderBy(params?.sort);

        function applyOrder<Q extends { orderBy(col: string, dir: string): Q }>(q: Q): Q {
            return orderClauses.reduce((acc, { col, dir }) => acc.orderBy(col, dir), q);
        }

        if (limit === 'all') {
            const rows = await applyOrder(
                db
                    .selectFrom('users')
                    .selectAll()
                    .where((eb) => buildUsersWhere(eb, params?.search) ?? eb.lit(true))
            ).execute();
            return {
                data: rows.map((r) => toUser(decode('users', r) as unknown as UserRow)),
                pagination: null,
            };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const [rows, countRow] = await Promise.all([
            applyOrder(
                db
                    .selectFrom('users')
                    .selectAll()
                    .where((eb) => buildUsersWhere(eb, params?.search) ?? eb.lit(true))
            )
                .limit(perPage)
                .offset(offset)
                .execute(),
            db
                .selectFrom('users')
                .select((eb) => [eb.fn.countAll<number>().as('c')])
                .where((eb) => buildUsersWhere(eb, params?.search) ?? eb.lit(true))
                .executeTakeFirst(),
        ]);

        const total = Number(countRow?.c ?? 0);
        return {
            data: rows.map((r) => toUser(decode('users', r) as unknown as UserRow)),
            pagination: {
                page,
                limit: perPage,
                total,
                pages: Math.ceil(total / perPage),
            },
        };
    },

    async get(id: string): Promise<User | null> {
        const db = getDb();
        const row = await db
            .selectFrom('users')
            .selectAll()
            .where('id', '=', id)
            .limit(1)
            .executeTakeFirst();
        return row ? toUser(decode('users', row) as unknown as UserRow) : null;
    },

    async create(data: {
        email: string;
        name: string;
        fields?: JsonObject;
        roleSlug?: string;
    }): Promise<User> {
        const validated = validate(createUserSchema, data);

        const fieldDefs = flattenFieldNodes(config.users?.fields ?? []);
        const processedFields = await processFields(
            (validated.fields ?? {}) as Record<string, unknown>,
            fieldDefs,
            {
                operation: 'create',
                host: { kind: 'user', record: null },
                user: getCurrentUser(),
                reads: scopedReadsFromRecords({
                    load: async () => (await usersApi.query({ limit: 'all' })).data,
                    getId: (r) => r.id,
                    getFields: (r) => (r.fields ?? {}) as Record<string, unknown>,
                }),
            }
        );
        if (Object.keys(processedFields.errors).length > 0) {
            throw ValidationError.fromFieldErrors(processedFields.errors);
        }
        const fields = processedFields.values as JsonObject;

        const db = getDb();
        const created = await db
            .insertInto('users')
            .values(
                encode('users', {
                    email: validated.email,
                    name: validated.name,
                    ...(Object.keys(fields).length > 0 && { fields }),
                    ...(validated.roleSlug !== undefined && {
                        roleSlug: validated.roleSlug,
                    }),
                }) as unknown as Insertable<DB['users']>
            )
            .returningAll()
            .executeTakeFirst();

        if (created) {
            return toUser(decode('users', created) as unknown as UserRow);
        }

        throw new Error('Failed to create user');
    },

    async update(
        id: string,
        data: Partial<{
            name: string;
            email: string;
            fields: JsonObject;
            roleSlug: string;
        }>
    ): Promise<User> {
        const validatedData = validate(updateUserSchema, data);

        if (validatedData.fields !== undefined) {
            const current = await usersApi.get(id);
            const fieldDefs = flattenFieldNodes(config.users?.fields ?? []);
            const processed = await processFields(
                validatedData.fields as Record<string, unknown>,
                fieldDefs,
                {
                    operation: 'update',
                    host: { kind: 'user', record: current },
                    user: getCurrentUser(),
                    reads: scopedReadsFromRecords({
                        load: async () => (await usersApi.query({ limit: 'all' })).data,
                        getId: (r) => r.id,
                        getFields: (r) => (r.fields ?? {}) as Record<string, unknown>,
                        excludeId: id,
                    }),
                }
            );
            if (Object.keys(processed.errors).length > 0) {
                throw ValidationError.fromFieldErrors(processed.errors);
            }
            validatedData.fields = processed.values as JsonObject;
        }

        const db = getDb();
        const updated = await db
            .updateTable('users')
            .set(
                encodePatch('users', {
                    ...(validatedData.name !== undefined && { name: validatedData.name }),
                    ...(validatedData.email !== undefined && {
                        email: validatedData.email,
                    }),
                    ...(validatedData.fields !== undefined && {
                        fields: validatedData.fields as JsonObject,
                    }),
                    ...(validatedData.roleSlug !== undefined && {
                        roleSlug: validatedData.roleSlug,
                    }),
                    updatedAt: new Date(),
                }) as unknown as Updateable<DB['users']>
            )
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirst();

        if (updated) {
            return toUser(decode('users', updated) as unknown as UserRow);
        }

        throw new Error('Failed to update user');
    },

    async delete(id: string): Promise<void> {
        const db = getDb();
        await createRelationshipStorage(db).deleteByUser(id);
        await db.deleteFrom('users').where('id', '=', id).execute();
    },
};
