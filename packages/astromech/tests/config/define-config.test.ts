/**
 * `defineConfig`: the typed identity a site's `astromech.config.ts` calls.
 */

import { makeTestConfig } from '@tests/harness';
import { describe, expect, it } from 'vitest';
import { defineConfig } from '@/config/define-config';

describe('defineConfig', () => {
    it('returns the config it is given, unchanged', () => {
        const config = makeTestConfig();

        expect(defineConfig(config)).toBe(config);
    });
});
