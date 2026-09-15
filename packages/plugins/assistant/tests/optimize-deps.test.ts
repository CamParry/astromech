/**
 * The assistant plugin's `admin.optimizeDeps.include` names every package its
 * admin components import in the browser, so the site's Vite pre-bundles them.
 */
import { fileURLToPath } from 'node:url';
import { missingFromOptimizeDeps } from '@tests/runtime-imports';
import { describe, expect, it } from 'vitest';
import { assistant } from '../src/index';

const adminDir = fileURLToPath(new URL('../src/admin', import.meta.url));

describe('assistant() admin.optimizeDeps', () => {
    it('lists every package the admin components import', () => {
        expect(
            missingFromOptimizeDeps(assistant().admin?.optimizeDeps?.include, adminDir)
        ).toEqual([]);
    });
});
