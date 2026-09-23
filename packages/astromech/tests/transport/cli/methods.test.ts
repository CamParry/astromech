/**
 * The CLI's method calls: through the manifest the boot generated and
 * `callMethod` as a trusted caller, so plugin hooks fire and the method's own
 * rules hold, as they do for every other transport.
 */

import type { Entry, PluginContext, PluginDefinition, User } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { setMethodManifest } from '@/codegen/manifest-registry';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { defineHook } from '@/plugins/define-hook';
import { callCoreMethod, callEntryMethod } from '@/transport/cli/methods';

const created: string[] = [];

const probe: PluginDefinition = {
    package: 'probe',
    hooks: [
        defineHook('entry:afterCreate', (payload, _ctx: PluginContext) => {
            created.push(payload.entry.id);
        }),
    ],
};

beforeEach(async () => {
    await createTestDb();
    const config = { ...makeTestConfig(), plugins: [probe] };
    const resolved = setupTestConfig(config);
    setMethodManifest(generateMethodManifest(resolved, [probe]));
    created.length = 0;
});

describe('callEntryMethod', () => {
    it('fires plugin hooks on a write', async () => {
        const entry = await callEntryMethod<Entry>('post', 'create', {
            data: { title: 'From the CLI' },
        });

        expect(created).toEqual([entry.id]);
    });

    it('keeps the method’s own rules', async () => {
        await expect(
            callEntryMethod('snippet', 'create', { data: { slug: 'nope' } })
        ).rejects.toMatchObject({ name: 'CapabilityError' });
    });

    it('names an entry type the manifest does not know', async () => {
        await expect(callEntryMethod('nope', 'create', { data: {} })).rejects.toThrow(
            'Unknown method "entries.create" for the entry type "nope".'
        );
    });
});

describe('callCoreMethod', () => {
    it('refuses a role the config does not define', async () => {
        await expect(
            callCoreMethod<User>('users.create', {
                data: { name: 'N', email: 'n@test.dev', role: 'superuser' },
            })
        ).rejects.toMatchObject({ name: 'ValidationError' });
    });
});
