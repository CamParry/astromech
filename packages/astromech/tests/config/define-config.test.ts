/**
 * `defineConfig`: the typed identity a site's `astromech.config.ts` calls.
 */

import type { AstromechConfig } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { defineConfig } from '@/config/define-config';

describe('defineConfig', () => {
    it('returns the config it is given, unchanged', () => {
        const config = { entries: {} } as unknown as AstromechConfig;

        expect(defineConfig(config)).toBe(config);
    });
});
