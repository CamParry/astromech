import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    out: './drizzle',
    dialect: 'sqlite',
    schema: '../src/db/schema.ts',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? 'file:./database.db',
    },
});
