import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    out: './drizzle',
    dialect: 'sqlite',
    schema: ['./src/exports/schema.ts', './src/exports/plugins/redirects-schema.ts'],
    dbCredentials: {
        url: process.env.DATABASE_URL ?? 'file:./demo/database.db',
    },
});
