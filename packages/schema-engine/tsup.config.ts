import { defineConfig } from 'tsup';

export default defineConfig({
    // Two entries: `.` is the pure, edge/D1-safe surface (model/DDL/diff/render/
    // apply/oracle — no `node:fs`), `./generate` is the Node-only generator that
    // reads and writes an app's `migrations/` directory. The split is enforced by
    // the package's export map rather than by convention.
    entry: { index: 'src/index.ts', generate: 'src/generate.ts' },
    format: ['esm'],
    target: 'node22',
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['kysely'],
    treeshake: true,
});
