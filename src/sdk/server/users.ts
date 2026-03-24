import { eq } from 'drizzle-orm';
import { usersTable } from '@/db';
import { getDb } from '@/db/registry.js';
import type { JsonObject, User } from '@/types/index.js';

function toUser(row: typeof usersTable.$inferSelect): User {
    return {
        ...row,
        fields: (row.fields as JsonObject | null) ?? null,
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

    async create(data: { email: string; name: string }): Promise<User> {
        const db = getDb();
        const user = await db
            .insert(usersTable)
            .values({
                email: data.email,
                name: data.name,
            })
            .returning();

        if (user.length > 0 && user[0]) {
            return toUser(user[0]);
        }

        throw new Error('Failed to create user');
    },

    async update(
        id: string,
        data: Partial<{ name: string; email: string }>
    ): Promise<User> {
        const db = getDb();
        const user = await db
            .update(usersTable)
            .set({
                ...(data.name !== undefined && { name: data.name }),
                ...(data.email !== undefined && { email: data.email }),
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
