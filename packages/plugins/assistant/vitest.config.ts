import { defineConfig } from 'vitest/config';

// This run needs core's `dist` built. Every core value these tests reach is
// mocked, but pnpm links the workspace `astromech` in to satisfy the peer
// dependency, so Vite resolves the import through its exports map before any
// mock applies. No src alias: a package's src and dist have different export
// conditions, and an alias would hide a broken exports map rather than show it.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
});
