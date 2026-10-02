// The aliases resolve core to its source, so this plugin and its tests share
// one module graph. `adminPages` runs `tests/admin/` in happy-dom with the
// admin's setup. See `packages/astromech/tests/_support/plugin-vitest-config.ts`.
import { pluginVitestConfig } from '../../astromech/tests/_support/plugin-vitest-config';

export default pluginVitestConfig({
    adminPages: true,
    // One entry per top-level directory of src/, plus the files at its root,
    // each set one point below what it measured. Raise an entry as coverage
    // rises; never lower one to pass.
    coverageThresholds: {
        'src/*.{ts,tsx}': { lines: 84, functions: 84, branches: 54, statements: 82 },
        'src/admin/**': { lines: 80, functions: 81, branches: 72, statements: 74 },
        'src/globals/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/pages/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/permissions/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/routes/**': { lines: 82, functions: 99, branches: 69, statements: 82 },
        'src/service/**': { lines: 99, functions: 99, branches: 89, statements: 99 },
        'src/tables/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
    },
});
