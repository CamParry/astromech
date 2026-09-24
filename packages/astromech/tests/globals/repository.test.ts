/**
 * The globals repository's own reads: a global is addressed by its config
 * key, and the service reaches the repository through its registry.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getGlobalRepository, setGlobalRepository } from '@/globals/repository';
import { makeGlobalsConfig } from './globals-config';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe('findByKey', () => {
    it('reads the canonical row in the named locale, else the default', async () => {
        const repository = getGlobalRepository();
        const site = await repository.create({ key: 'site' }, { fields: { a: 1 } });
        await repository.update({ id: site.id, locale: 'de' }, { fields: { a: 2 } });
        await repository.staging.create({ id: site.id }, { fields: { a: 3 } });

        expect((await repository.findByKey('site'))?.fields).toEqual({ a: 1 });
        expect((await repository.findByKey('site', 'de'))?.fields).toEqual({ a: 2 });
        expect(await repository.findByKey('site', 'fr')).toBeNull();
        expect(await repository.findByKey('missing')).toBeNull();
    });
});

describe('findIdByKey', () => {
    it('resolves the row id from the key', async () => {
        const repository = getGlobalRepository();
        const site = await repository.create({ key: 'site' }, {});

        expect(await repository.findIdByKey('site')).toBe(site.id);
        expect(await repository.findIdByKey('missing')).toBeNull();
    });
});

describe('the registered repository', () => {
    const registered = getGlobalRepository();

    afterEach(() => {
        setGlobalRepository(registered);
    });

    it('is the one the service reads through', async () => {
        await currentServices.globals.update({
            key: 'contact',
            data: { fields: { email: 'hi@example.dev' } },
        });
        setGlobalRepository({ ...registered, findByKey: () => Promise.resolve(null) });

        expect(
            await currentServices.globals.get({ key: 'contact', full: true })
        ).toBeNull();
    });
});
