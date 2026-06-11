import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    out: './drizzle',
    dialect: 'sqlite',
    schema: ['./src/db/schema.ts', './src/plugins/redirects/schema.ts'],
    dbCredentials: {
        url: process.env.DATABASE_URL ?? 'file:./demo/database.db',
    },
});
