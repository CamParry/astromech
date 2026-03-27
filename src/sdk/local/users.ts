import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { usersTable } from '@/db';
import { getDb } from '@/db/registry.js';
import type { JsonObject, User } from '@/types/index.js';
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

export const usersApi = {
    async all(): Promise<User[]> {
        const db = getDb();
        const users = await db.select().from(usersTable);
        return users.map(toUser);
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
