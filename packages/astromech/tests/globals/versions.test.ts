/**
 * Version history a global has and other resources do not: versioning can be
 * turned off. The rules every resource shares are in
 * `tests/content/resource-versions.test.ts`.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { CapabilityError } from '@/errors/capability';
import { makeGlobalsConfig } from './globals-config';

const api = currentServices.globals;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe('versioning (off)', () => {
    it('refuses every version method', async () => {
        await api.update({ key: 'theme', data: { fields: { accent: 'red' } } });
        await api.update({ key: 'theme', data: { fields: { accent: 'blue' } } });

        await expect(api.versions({ key: 'theme' })).rejects.toThrow(CapabilityError);
        await expect(api.getVersion({ key: 'theme', version: 1 })).rejects.toThrow(
            CapabilityError
        );
        await expect(api.restoreVersion({ key: 'theme', version: 1 })).rejects.toThrow(
            'Global "theme" does not support capability: versioning'
        );
    });
});
