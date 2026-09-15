import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// This run needs core's `dist` built. Every core value these tests reach is
// mocked, but pnpm links the workspace `astromech` in to satisfy the peer
// dependency, so Vite resolves the import through its exports map before any
// mock applies. No src alias: a package's src and dist have different export
// conditions, and an alias would hide a broken exports map rather than show it.
// `@tests` is core's shared test support, which loads nothing from core.
export default defineConfig({
    resolve: {
        alias: {
            '@tests': fileURLToPath(
                new URL('../../astromech/tests/_support', import.meta.url)
            ),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
});
