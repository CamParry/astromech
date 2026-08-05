import { defineConfig } from 'vitest/config';

// The only core value these tests reach is mocked, so this run needs no built
// core dist. No src alias either: a package's src and dist have different export
// conditions, and an alias would hide a broken exports map rather than show it.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
});
