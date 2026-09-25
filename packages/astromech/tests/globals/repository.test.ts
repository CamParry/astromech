/**
 * The globals repository's own reads: a global is addressed by its config
 * key, and the service reads through the exported repository object.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { globalRepository } from '@/globals/repository';
import { makeGlobalsConfig } from './globals-config';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe('findByKey', () => {
    it('reads the canonical row in the named locale, else the default', async () => {
        const site = await globalRepository.create({ key: 'site' }, { fields: { a: 1 } });
        await globalRepository.update(
            { id: site.id, locale: 'de' },
            { fields: { a: 2 } }
        );
        await globalRepository.staging.create({ id: site.id }, { fields: { a: 3 } });

        expect((await globalRepository.findByKey('site'))?.fields).toEqual({ a: 1 });
        expect((await globalRepository.findByKey('site', 'de'))?.fields).toEqual({
            a: 2,
        });
        expect(await globalRepository.findByKey('site', 'fr')).toBeNull();
        expect(await globalRepository.findByKey('missing')).toBeNull();
    });
});

describe('findIdByKey', () => {
    it('resolves the row id from the key', async () => {
        const site = await globalRepository.create({ key: 'site' }, {});

        expect(await globalRepository.findIdByKey('site')).toBe(site.id);
        expect(await globalRepository.findIdByKey('missing')).toBeNull();
    });
});

describe('the exported repository', () => {
    it('is the one the service reads through', async () => {
        await currentServices.globals.update({
            key: 'contact',
            data: { fields: { email: 'hi@example.dev' } },
        });
        vi.spyOn(globalRepository, 'findByKey').mockResolvedValue(null);

        expect(
            await currentServices.globals.get({ key: 'contact', full: true })
        ).toBeNull();
    });
});
