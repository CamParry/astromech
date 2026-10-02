// The aliases resolve core to its source, so this plugin and its tests share
// one module graph. See `packages/astromech/tests/_support/plugin-vitest-config.ts`.
import { pluginVitestConfig } from '../../astromech/tests/_support/plugin-vitest-config';

export default pluginVitestConfig({
    // One entry per top-level directory of src/, plus the files at its root,
    // each set one point below what it measured. Raise an entry as coverage
    // rises; never lower one to pass.
    coverageThresholds: {
        'src/*.{ts,tsx}': { lines: 99, functions: 99, branches: 49, statements: 99 },
        'src/admin/**': { lines: 78, functions: 78, branches: 62, statements: 75 },
        'src/approvals/**': { lines: 99, functions: 99, branches: 70, statements: 99 },
        'src/loop/**': { lines: 97, functions: 99, branches: 89, statements: 96 },
        'src/permissions/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/routes/**': { lines: 92, functions: 90, branches: 95, statements: 93 },
        'src/service/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/sessions/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
        'src/tables/**': { lines: 99, functions: 99, branches: 99, statements: 99 },
    },
});
