/**
 * Unit tests for the db:generate codegen builder functions.
 */

import { describe, it, expect } from 'vitest';
import { buildCombinedSchemaModule, buildDrizzleConfig } from './db-generate.js';

describe('buildCombinedSchemaModule', () => {
    it('emits one export * per specifier', () => {
        const out = buildCombinedSchemaModule([
            'astromech/db/schema',
            '@astromech/redirects/schema',
        ]);
        expect(out).toContain("export * from 'astromech/db/schema';");
        expect(out).toContain("export * from '@astromech/redirects/schema';");
    });

    it('handles a single specifier', () => {
        const out = buildCombinedSchemaModule(['astromech/db/schema']);
        expect(out).toBe("export * from 'astromech/db/schema';\n");
    });

    it('each specifier is on its own line', () => {
        const out = buildCombinedSchemaModule(['a', 'b', 'c']);
        const lines = out.trim().split('\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe("export * from 'a';");
        expect(lines[1]).toBe("export * from 'b';");
        expect(lines[2]).toBe("export * from 'c';");
    });
});

describe('buildDrizzleConfig', () => {
    it('includes dialect sqlite', () => {
        const out = buildDrizzleConfig({
            schemaPath: './drizzle.schema.ts',
            dbUrlDefault: 'file:./database.db',
        });
        expect(out).toContain("dialect: 'sqlite'");
    });

    it('sets schema to the provided path', () => {
        const out = buildDrizzleConfig({
            schemaPath: './drizzle.schema.ts',
            dbUrlDefault: 'file:./database.db',
        });
        expect(out).toContain("schema: './drizzle.schema.ts'");
    });

    it('sets out to ./drizzle', () => {
        const out = buildDrizzleConfig({
            schemaPath: './drizzle.schema.ts',
            dbUrlDefault: 'file:./database.db',
        });
        expect(out).toContain("out: './drizzle'");
    });

    it('includes DATABASE_URL fallback with the provided default', () => {
        const out = buildDrizzleConfig({
            schemaPath: './drizzle.schema.ts',
            dbUrlDefault: 'file:./database.db',
        });
        expect(out).toContain("process.env.DATABASE_URL ?? 'file:./database.db'");
    });

    it('imports from drizzle-kit', () => {
        const out = buildDrizzleConfig({
            schemaPath: './drizzle.schema.ts',
            dbUrlDefault: 'file:./database.db',
        });
        expect(out).toContain("import { defineConfig } from 'drizzle-kit'");
    });
});
