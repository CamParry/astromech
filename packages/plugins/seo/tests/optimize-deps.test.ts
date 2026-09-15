/**
 * The SEO plugin's `admin.optimizeDeps.include` names every package its
 * admin components import in the browser, so the site's Vite pre-bundles them.
 */
import { fileURLToPath } from 'node:url';
import { missingFromOptimizeDeps } from '@tests/runtime-imports';
import { describe, expect, it } from 'vitest';
import { seo } from '../src/index';

const adminDir = fileURLToPath(new URL('../src/admin', import.meta.url));

describe('seo() admin.optimizeDeps', () => {
    it('lists every package the admin components import', () => {
        expect(
            missingFromOptimizeDeps(seo().admin?.optimizeDeps?.include, adminDir)
        ).toEqual([]);
    });
});
