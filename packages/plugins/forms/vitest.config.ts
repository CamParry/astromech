// The aliases resolve core to its source, so this plugin and its tests share
// one module graph. See `packages/astromech/tests/_support/plugin-vitest-config.ts`.
import { pluginVitestConfig } from '../../astromech/tests/_support/plugin-vitest-config';

export default pluginVitestConfig({
    // One entry per top-level directory of src/, plus the files at its root,
    // each set one point below what it measured. Raise an entry as coverage
    // rises; never lower one to pass.
    coverageThresholds: {
        'src/*.{ts,tsx}': { lines: 99, functions: 99, branches: 87, statements: 99 },
        'src/entries/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/fields/**': { lines: 99, functions: 99, branches: 84, statements: 94 },
        'src/hooks/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/notifications/**': {
            lines: 89,
            functions: 99,
            branches: 77,
            statements: 87,
        },
        'src/permissions/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/resources/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/service/**': { lines: 97, functions: 99, branches: 88, statements: 97 },
        'src/spam/**': { lines: 94, functions: 99, branches: 87, statements: 93 },
        'src/tables/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/utilities/**': { lines: 95, functions: 99, branches: 90, statements: 93 },
    },
});
