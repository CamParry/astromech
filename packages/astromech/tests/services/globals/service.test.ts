/**
 * The globals service's core contract: a key resolves or it does not, a
 * declared-but-unsaved global reads as null, and the first write creates the
 * rows nothing created at boot.
 */

import { createTestDb, createTestUser, runAsUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/database/registry';
import { GlobalNotFoundError } from '@/globals/errors';
import { globalsService as api } from '@/globals/service';
import { makeGlobalsConfig } from './globals-config';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe('an undeclared key', () => {
    it('throws from get rather than answering null', async () => {
        await expect(api.get({ key: 'nope', full: true })).rejects.toThrow(
            GlobalNotFoundError
        );
    });

    it('throws from update', async () => {
        await expect(
            api.update({ key: 'nope', data: { fields: { title: 'x' } } })
        ).rejects.toThrow(/Global 'nope' is not declared/);
    });
});

describe('a declared global with nothing saved', () => {
    it('reads as null, with no row created by the read', async () => {
        expect(await api.get({ key: 'contact', full: true })).toBeNull();
        expect(await getDb().selectFrom('globals').selectAll().execute()).toEqual([]);
    });
});

describe('update', () => {
    it('creates the global on the first write', async () => {
        const saved = await api.update({
            key: 'contact',
            data: { fields: { email: 'hi@example.dev' } },
        });

        expect(saved.key).toBe('contact');
        expect(saved.locale).toBe('en');
        expect(saved.locales).toEqual(['en']);
        expect(saved.status).toBe('unpublished');
        expect(saved.staged).toBe(false);
        expect(saved.publishedAt).toBeNull();
        expect(saved.fields).toEqual({ email: 'hi@example.dev' });
        expect(saved.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
        expect(saved.createdAt).toBeInstanceOf(Date);
    });

    it('merges: an omitted field keeps its stored value', async () => {
        await api.update({
            key: 'contact',
            data: { fields: { email: 'hi@example.dev', phone: '123' } },
        });
        const second = await api.update({
            key: 'contact',
            data: { fields: { phone: '456' } },
        });

        expect(second.fields).toEqual({ email: 'hi@example.dev', phone: '456' });
    });

    it('keeps the same id across updates', async () => {
        const first = await api.update({ key: 'contact', data: { fields: {} } });
        const second = await api.update({
            key: 'contact',
            data: { fields: { email: 'a@b.dev' } },
        });

        expect(second.id).toBe(first.id);
        const rows = await getDb().selectFrom('globals').selectAll().execute();
        expect(rows).toHaveLength(1);
    });

    it('does not leak the content row id', async () => {
        const saved = await api.update({ key: 'contact', data: { fields: {} } });
        expect(saved).not.toHaveProperty('contentId');
    });

    it('credits the acting user on create and on update', async () => {
        const author = await createTestUser(getDb());
        const editor = await createTestUser(getDb());

        const created = await runAsUser({ id: author.id } as never, () =>
            api.update({ key: 'contact', data: { fields: { email: 'a@b.dev' } } })
        );
        expect(created.createdBy).toBe(author.id);
        expect(created.updatedBy).toBe(author.id);

        const edited = await runAsUser({ id: editor.id } as never, () =>
            api.update({ key: 'contact', data: { fields: { phone: '1' } } })
        );
        expect(edited.createdBy).toBe(author.id);
        expect(edited.updatedBy).toBe(editor.id);
    });
});
