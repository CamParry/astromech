/**
 * The settings service as a definition: what its catalogue declares, and that
 * `bind(ctx)` applies the public-key rule from the context it was bound to
 * rather than from the ambient config.
 */

import type { AppContext, AstromechConfig, SettingsService } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { getConfig } from '@/config/registry';
import { settingsDefinition } from '@/settings/service';

/** `site` is a public key; nothing else is. */
function makePublicConfig(): AstromechConfig {
    return { ...makeTestConfig(), publicSettings: ['site'] };
}

/** Whether each method changes persisted state. */
const MUTATES: Record<keyof SettingsService, boolean> = {
    all: false,
    get: false,
    set: true,
};

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makePublicConfig());
});

describe('the catalogue', () => {
    it('holds exactly the SettingsService methods, each stamped with its id', () => {
        expect(Object.keys(settingsDefinition.catalogue).sort()).toEqual(
            Object.keys(MUTATES).sort()
        );
        for (const [key, method] of Object.entries(settingsDefinition.catalogue)) {
            expect(method.name, key).toBe(`settings.${key}`);
        }
    });

    it('declares which methods write', () => {
        for (const [key, mutates] of Object.entries(MUTATES)) {
            const method = settingsDefinition.catalogue[key as keyof SettingsService];
            expect(method.mutates, key).toBe(mutates);
        }
    });
});

describe('bind', () => {
    it('reads the public-key rule off the context, with no request store in play', async () => {
        const ctx = createAppContext({ user: null, role: null });
        await settingsDefinition.bind(ctx).set({ key: 'site', value: { title: 'Home' } });

        // The ambient config marks `site` public. A context whose config marks
        // nothing public hides it — which only a handler reading `ctx.config` does.
        const nothingPublic = Object.create(ctx, {
            config: { value: { ...getConfig(), publicSettingKeys: [] } },
        }) as AppContext;

        expect(await settingsDefinition.bind(ctx).all()).toHaveLength(1);
        expect(await settingsDefinition.bind(nothingPublic).all()).toEqual([]);
    });
});
