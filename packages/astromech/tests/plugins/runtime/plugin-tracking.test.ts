/**
 * `_astromech_plugins` tracking — the row `bootPlugins` upserts per installed
 * plugin.
 *
 * The point of the table is to make *removed* plugins visible, so the tests
 * cover both directions: booting records/refreshes a row without ever losing the
 * original `installedAt`, and booting without a previously-tracked plugin warns
 * (pointing at `plugin:purge`) rather than cleaning up behind the user's back.
 */
import type { PluginTrackingRow } from '@/database/tables';
import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeWith } from '@/database/codec';
import { pluginsTable } from '@/database/tables';
import { bootPlugins } from '@/plugins/runtime/plugin-runtime';

type Db = Kysely<DB>;

/** Tracking rows as domain values (`installedAt` decoded to a `Date`). */
async function trackedRows(db: Db): Promise<PluginTrackingRow[]> {
    const rows = await db
        .selectFrom('_astromech_plugins')
        .selectAll()
        .orderBy('package')
        .execute();
    return rows.map((row) => decodeWith(pluginsTable, row));
}

let db: Db;

beforeEach(async () => {
    db = await createTestDb();
});

describe('bootPlugins – plugin tracking', () => {
    it('records one row per plugin, keyed on package, with its namespace and version', async () => {
        await bootPlugins([
            { package: '@astromech/redirects', version: '1.2.3' },
            { package: '@astromech/backups', version: '0.4.0' },
        ]);

        const rows = await trackedRows(db);
        expect(rows.map((row) => [row.package, row.namespace, row.version])).toEqual([
            ['@astromech/backups', 'backups', '0.4.0'],
            ['@astromech/redirects', 'redirects', '1.2.3'],
        ]);
        expect(rows[0]?.installedAt).toBeInstanceOf(Date);
    });

    it('records the derived namespace, keeping a third-party scope', async () => {
        await bootPlugins([{ package: '@acme/redirects', version: '1.0.0' }]);

        const rows = await trackedRows(db);
        expect(rows.map((row) => [row.package, row.namespace])).toEqual([
            ['@acme/redirects', 'acme_redirects'],
        ]);
    });

    it('defaults the version to 0.0.0 when the plugin declares none', async () => {
        await bootPlugins([{ package: '@astromech/menus' }]);

        const rows = await trackedRows(db);
        expect(rows.map((row) => [row.namespace, row.version])).toEqual([
            ['menus', '0.0.0'],
        ]);
    });

    it('does not duplicate rows when the same plugin boots twice', async () => {
        const defs = [{ package: '@astromech/backups', version: '1.0.0' }];
        await bootPlugins(defs);
        await bootPlugins(defs);

        const rows = await trackedRows(db);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.version).toBe('1.0.0');
    });

    // Pins `trackPlugin`'s documented contract: "a conflict only refreshes
    // `version`, so the original install time survives".
    it('updates version on a bump while keeping the original installedAt', async () => {
        await bootPlugins([{ package: '@astromech/backups', version: '1.0.0' }]);
        const [first] = await trackedRows(db);
        expect(first).toBeDefined();

        await new Promise((r) => setTimeout(r, 5));
        await bootPlugins([{ package: '@astromech/backups', version: '2.0.0' }]);

        const rows = await trackedRows(db);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.version).toBe('2.0.0');
        expect(rows[0]?.installedAt.getTime()).toBe(first?.installedAt.getTime());
    });
});

describe('bootPlugins – removed-plugin warning', () => {
    it('warns about a tracked plugin missing from the passed defs', async () => {
        await bootPlugins([
            { package: '@astromech/redirects', version: '1.0.0' },
            { package: '@astromech/backups', version: '1.0.0' },
        ]);

        const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let messages: string[];
        try {
            await bootPlugins([{ package: '@astromech/redirects', version: '1.0.0' }]);
            // Read the calls before restoring — `mockRestore` clears mock state.
            messages = warn.mock.calls.map((call) => String(call[0]));
        } finally {
            warn.mockRestore();
        }

        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('@astromech/backups');
        expect(messages[0]).toContain('plugin:purge @astromech/backups');
    });

    it('does not warn while every tracked plugin is still configured', async () => {
        await bootPlugins([{ package: '@astromech/backups', version: '1.0.0' }]);

        const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let calls: number;
        try {
            await bootPlugins([{ package: '@astromech/backups', version: '1.0.0' }]);
            calls = warn.mock.calls.length;
        } finally {
            warn.mockRestore();
        }

        expect(calls).toBe(0);
    });
});
