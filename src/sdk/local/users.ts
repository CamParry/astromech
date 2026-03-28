import { eq, and, asc, desc, like, or, count } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';
import { z } from 'zod';
import { usersTable } from '@/db';
import { getDb } from '@/db/registry.js';
import type { JsonObject, User, QueryResult, UserQueryParams, SortOption } from '@/types/index.js';
import { ValidationError } from '@/errors/validation.js';
import { createUserSchema, updateUserSchema } from '@/schemas/users.js';

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (err) {
        if (err instanceof z.ZodError) throw new ValidationError(err.issues);
        throw err;
    }
}

function toUser(row: typeof usersTable.$inferSelect): User {
    return {
        ...row,
        fields: (row.fields as JsonObject | null) ?? null,
        roleSlug: row.roleSlug,
    };
}

const SORTABLE_FIELDS: Record<string, AnyColumn> = {
    name: usersTable.name,
    email: usersTable.email,
    createdAt: usersTable.createdAt,
    updatedAt: usersTable.updatedAt,
    roleSlug: usersTable.roleSlug,
};

function buildOrderBy(sort?: SortOption | SortOption[]) {
    if (!sort) return [asc(usersTable.name)];
    const sorts = Array.isArray(sort) ? sort : [sort];
    const clauses = sorts.flatMap((s) =>
        Object.entries(s)
            .filter(([field]) => field in SORTABLE_FIELDS)
            .map(([field, dir]) => {
                const col = SORTABLE_FIELDS[field]!;
                return dir === 'asc' ? asc(col) : desc(col);
            })
    );
    return clauses.length > 0 ? clauses : [asc(usersTable.name)];
}

export const usersApi = {
    async query(params?: UserQueryParams): Promise<QueryResult<User>> {
        const db = getDb();
        const page = params?.page ?? 1;
        const limit = params?.limit;

        const conditions = [];
        if (params?.search) {
            conditions.push(or(
                like(usersTable.name, `%${params.search}%`),
                like(usersTable.email, `%${params.search}%`)
            ));
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const orderClauses = buildOrderBy(params?.sort);

        if (limit === 'all') {
            const rows = await db.select().from(usersTable).where(where).orderBy(...orderClauses);
            return { data: rows.map(toUser), pagination: null };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const [rows, countRows] = await Promise.all([
            db.select().from(usersTable).where(where).orderBy(...orderClauses).limit(perPage).offset(offset),
            db.select({ count: count() }).from(usersTable).where(where),
        ]);

        const total = countRows[0]?.count ?? 0;
        return {
            data: rows.map(toUser),
            pagination: { page, limit: perPage, total, pages: Math.ceil(total / perPage) },
        };
    },

    async get(id: string): Promise<User | null> {
        const db = getDb();
        const user = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, id))
            .limit(1);
        return user.length > 0 ? toUser(user[0]!) : null;
    },

    async create(data: { email: string; name: string; fields?: JsonObject; roleSlug?: string }): Promise<User> {
        const validated = validate(createUserSchema, data);
        const db = getDb();
        const user = await db
            .insert(usersTable)
            .values({
                email: validated.email,
                name: validated.name,
                ...(validated.roleSlug !== undefined && { roleSlug: validated.roleSlug }),
            })
            .returning();

        if (user.length > 0 && user[0]) {
            return toUser(user[0]);
        }

        throw new Error('Failed to create user');
    },

    async update(
        id: string,
        data: Partial<{ name: string; email: string; fields: JsonObject; roleSlug: string }>
    ): Promise<User> {
        const validatedData = validate(updateUserSchema, data);
        const db = getDb();
        const user = await db
            .update(usersTable)
            .set({
                ...(validatedData.name !== undefined && { name: validatedData.name }),
                ...(validatedData.email !== undefined && { email: validatedData.email }),
                ...(validatedData.fields !== undefined && { fields: validatedData.fields as JsonObject }),
                ...(validatedData.roleSlug !== undefined && { roleSlug: validatedData.roleSlug }),
                updatedAt: new Date(),
            })
            .where(eq(usersTable.id, id))
            .returning();

        if (user.length > 0 && user[0]) {
            return toUser(user[0]);
        }

        throw new Error('Failed to update user');
    },

    async delete(id: string): Promise<void> {
        const db = getDb();
        await db.delete(usersTable).where(eq(usersTable.id, id));
    },
};
