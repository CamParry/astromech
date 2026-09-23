/**
 * One fixture plugin's entry type and global, followed through every consumer
 * of the resolved config: each must see them exactly as it sees a site's own.
 */

import type { AstromechConfig, JsonObject, PluginDefinition } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { systemAppContext } from '@/app-context/app-context';
import { entriesService, globalsService } from '@/app-context/services';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { generateClientTypes } from '@/codegen/type-generator';
import { buildAdminConfig } from '@/config/admin-config';
import { resolveConfig } from '@/config/resolve';
import { createRepository } from '@/database/repository/create-repository';
import { entryContentTable } from '@/entries/tables';
import { globalContentTable } from '@/globals/tables';
import { buildPermissionCatalogue } from '@/permissions/catalogue';
import { validateStoredContent } from '@/transport/cli/validate-stored-content';

const fixturePlugin: PluginDefinition = {
    package: 'fixture',
    entries: [
        {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            fields: [{ name: 'rating', type: 'number', validation: [{ max: 5 }] }],
        },
    ],
    globals: [
        {
            key: 'options',
            label: 'Options',
            fields: [{ name: 'limit', type: 'number', validation: [{ max: 5 }] }],
        },
    ],
};

function fixtureConfig(): AstromechConfig {
    return { ...makeTestConfig(), plugins: [fixturePlugin] };
}

describe('a plugin entry type and global in the one registry', () => {
    const resolved = resolveConfig(fixtureConfig());

    it('resolves into the same maps as the site types, owned by the plugin', () => {
        expect(resolved.entryTypes['fixture/item']).toMatchObject({
            id: 'fixture/item',
            plugin: 'fixture',
        });
        expect(resolved.globals['fixture/options']).toMatchObject({
            id: 'fixture/options',
            plugin: 'fixture',
        });
    });

    it('is in the permissions catalogue', () => {
        const permissions = buildPermissionCatalogue(resolved, [fixturePlugin]);

        expect(permissions).toContainEqual(
            expect.objectContaining({
                permission: 'plugin:fixture:entry:item:read',
                source: 'entry',
                owner: 'fixture/item',
            })
        );
        expect(permissions).toContainEqual(
            expect.objectContaining({
                permission: 'plugin:fixture:global:options:update',
                source: 'global',
                owner: 'fixture/options',
            })
        );
    });

    it('is in the generated types, keyed by its id', () => {
        const output = generateClientTypes(resolved, [fixturePlugin]);

        expect(output).toContain(
            '"fixture/item": { fields: FixtureItemFields; fieldsPublic: FixtureItemFieldsPublic; relations: FixtureItemRelations };'
        );
        expect(output).toContain(
            '"fixture/options": { fields: FixtureOptionsGlobalFields };'
        );
    });

    it('is in the admin config, owned by the plugin', () => {
        const admin = buildAdminConfig(fixtureConfig(), resolved);

        expect(admin.entryTypes['fixture/item']).toMatchObject({
            plugin: 'fixture',
            single: 'Item',
        });
        expect(admin.globals['fixture/options']).toMatchObject({
            plugin: 'fixture',
            label: 'Options',
        });
        expect(admin.plugins[0]?.nav[0]?.children).toEqual([
            {
                label: 'Items',
                to: '/plugin/fixture/entries/item',
                permission: 'plugin:fixture:entry:item:read',
            },
            {
                label: 'Options',
                to: '/plugin/fixture/globals/options',
                permission: 'plugin:fixture:global:options:read',
            },
        ]);
    });

    it('is in the method manifest', () => {
        const { methods } = generateMethodManifest(resolved, [fixturePlugin]);

        expect(methods).toContainEqual(
            expect.objectContaining({
                id: 'entries.fixture/item.create',
                typeId: 'fixture/item',
                plugin: 'fixture',
                permission: 'plugin:fixture:entry:item:create',
            })
        );
    });
});

describe('a plugin entry type and global under `astromech validate`', () => {
    beforeEach(async () => {
        await createTestDb();
        setupTestConfig(fixtureConfig());
    });

    it('reports stored rows the rules reject, under the plugin ids', async () => {
        const item = await entriesService.create({
            type: 'fixture/item',
            data: { title: 'Item', fields: { rating: 3 } },
        });
        await globalsService.update({
            key: 'fixture/options',
            data: { fields: { limit: 3 } },
        });
        const tooHigh: JsonObject = { rating: 9, limit: 9 };
        await createRepository(entryContentTable).updateMany(
            { entryId: item.id },
            { fields: tooHigh }
        );
        await createRepository(globalContentTable).updateMany({}, { fields: tooHigh });

        const report = await validateStoredContent(systemAppContext());

        expect(
            report.findings.map((finding) => [finding.kind, finding.type ?? finding.id])
        ).toEqual([
            ['entry', 'fixture/item'],
            ['global', 'fixture/options'],
        ]);
    });
});
