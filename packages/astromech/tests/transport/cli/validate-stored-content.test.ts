/**
 * `astromech validate` — the report over stored rows.
 *
 * Rows are written through the service write paths and then rewritten behind
 * the pipeline's back (straight through storage), because a rule that a write
 * would reject is exactly what the report exists to find.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { validateStoredContent } from '@/transport/cli/validate-stored-content';
import { createStorage } from '@/database/storage/create-storage';
import { entriesTable } from '@/entries/schema';
import { entriesService as api } from '@/entries/service';
import { settingsService } from '@/settings/service';
import { createSettingsStorage } from '@/settings/storage';
import { usersService } from '@/users/service';
import { createUserStorage } from '@/users/storage';
import type { AstromechConfig, JsonObject } from '@/types/index';

/**
 * `article` carries a bounded number and a unique code; `report` carries the
 * same code field so `--type` scoping has a second type to leave alone. One
 * translatable admin page covers the split-blob settings case.
 */
function makeValidateConfig(): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            article: {
                single: 'Article',
                plural: 'Articles',
                fields: [
                    {
                        name: 'rating',
                        type: 'number',
                        label: 'Rating',
                        validation: [{ min: 1 }, { max: 5 }],
                    },
                    {
                        name: 'code',
                        type: 'text',
                        label: 'Code',
                        validation: [{ unique: true }],
                    },
                    { name: 'summary', type: 'text', label: 'Summary', required: true },
                    {
                        name: 'sections',
                        type: 'repeater',
                        label: 'Sections',
                        fields: [{ name: 'heading', type: 'text', label: 'Heading' }],
                    },
                ],
            },
            report: {
                single: 'Report',
                plural: 'Reports',
                fields: [
                    {
                        name: 'rating',
                        type: 'number',
                        label: 'Rating',
                        validation: [{ max: 5 }],
                    },
                ],
            },
        },
        users: {
            fields: [
                {
                    name: 'nickname',
                    type: 'text',
                    label: 'Nickname',
                    validation: [{ maxLength: 5 }],
                },
            ],
        },
        admin: {
            pages: [
                {
                    path: 'branding',
                    label: 'Branding',
                    translatable: true,
                    fields: [
                        {
                            name: 'company',
                            type: 'text',
                            label: 'Company',
                            validation: [{ maxLength: 5 }],
                        },
                        {
                            name: 'tagline',
                            type: 'text',
                            label: 'Tagline',
                            translatable: true,
                            required: true,
                        },
                    ],
                },
            ],
        },
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeValidateConfig());
});

/** Overwrite a stored row's field blob without going through the pipeline. */
async function storeFields(id: string, fields: JsonObject): Promise<void> {
    await createStorage(entriesTable).update(id, { fields });
}

/** Every field blob a run could touch, serialized for a straight comparison. */
async function snapshot(): Promise<string> {
    const entries = await createStorage(entriesTable).findMany({ where: {} });
    const users = await createUserStorage().list();
    const settings = await settingsService.all({ full: true });
    return JSON.stringify([
        entries.map((row) => [row.id, row.fields]),
        users.map((row) => [row.id, row.fields]),
        settings.map((row) => [row.key, row.value]),
    ]);
}

describe('validateStoredContent', () => {
    it('reports nothing for rows the write paths accepted', async () => {
        await api.create({
            type: 'article',
            title: 'Fine',
            fields: { rating: 3, code: 'a' },
        });
        await usersService.create({
            email: 'owner@test.dev',
            name: 'Owner',
            fields: { nickname: 'ok' },
        });

        const report = await validateStoredContent();

        expect(report.findings).toEqual([]);
        expect(report.rowsChecked).toBeGreaterThan(0);
    });

    // `children()` mints item ids into the values the pipeline returns, so a run
    // that kept them would be a write in waiting.
    it('leaves every stored row untouched', async () => {
        await api.create({
            type: 'article',
            title: 'Sections',
            fields: { summary: 'S', sections: [{ heading: 'One' }, { heading: 'Two' }] },
        });
        await usersService.create({
            email: 'owner@test.dev',
            name: 'Owner',
            fields: { nickname: 'ok' },
        });
        await settingsService.set({ key: 'branding', value: { company: 'Acme' } });
        const before = await snapshot();

        await validateStoredContent();

        expect(await snapshot()).toEqual(before);
    });

    it('reports an out-of-range value with its path and message', async () => {
        const article = await api.create({
            type: 'article',
            title: 'Too high',
            fields: { rating: 3 },
        });
        await storeFields(article.id, { rating: 9 });

        const report = await validateStoredContent();

        expect(report.findings).toEqual([
            {
                kind: 'entry',
                type: 'article',
                id: article.id,
                locale: 'en',
                fieldPath: 'rating',
                message: 'Must be at most 5',
            },
        ]);
    });

    it('reports a wrong-shape value', async () => {
        const article = await api.create({ type: 'article', title: 'Wrong shape' });
        await storeFields(article.id, { rating: 'three' });

        const report = await validateStoredContent();

        expect(report.findings).toHaveLength(1);
        expect(report.findings[0]?.fieldPath).toBe('rating');
    });

    // `required` is a completeness check: a draft may be unfinished, the same
    // row published may not.
    it('validates each row at the stage its own status implies', async () => {
        const article = await api.create({ type: 'article', title: 'Draft' });

        expect((await validateStoredContent()).findings).toEqual([]);

        await createStorage(entriesTable).update(article.id, { status: 'published' });

        expect((await validateStoredContent()).findings).toEqual([
            {
                kind: 'entry',
                type: 'article',
                id: article.id,
                locale: 'en',
                fieldPath: 'summary',
                message: 'This field is required',
            },
        ]);
    });

    // Without `excludeId` the row's own stored value is what it collides with.
    it('does not report a unique value as colliding with itself', async () => {
        await api.create({
            type: 'article',
            title: 'One',
            fields: { rating: 1, code: 'only' },
        });

        expect((await validateStoredContent()).findings).toEqual([]);
    });

    it('reports two rows that share a unique value', async () => {
        const first = await api.create({
            type: 'article',
            title: 'One',
            fields: { code: 'dup' },
        });
        const second = await api.create({ type: 'article', title: 'Two' });
        await storeFields(second.id, { code: 'dup' });

        const report = await validateStoredContent();

        expect(report.findings.map((finding) => finding.id).sort()).toEqual(
            [first.id, second.id].sort()
        );
        expect(report.findings.every((f) => f.message === 'Already in use')).toBe(true);
    });

    it('skips trashed rows', async () => {
        const article = await api.create({ type: 'article', title: 'Gone' });
        await storeFields(article.id, { rating: 9 });
        await api.trash({ type: 'article', id: article.id });

        expect((await validateStoredContent()).findings).toEqual([]);
    });

    it('reports a user row against the current rules', async () => {
        const user = await usersService.create({
            email: 'long@test.dev',
            name: 'Long',
            fields: { nickname: 'ok' },
        });
        await createUserStorage().update(user.id, {
            fields: { nickname: 'far too long' },
        });

        const report = await validateStoredContent();

        expect(report.findings).toEqual([
            {
                kind: 'user',
                type: null,
                id: user.id,
                locale: null,
                fieldPath: 'nickname',
                message: 'Must be at most 5 characters',
            },
        ]);
    });

    // A translatable page splits its blob across `<key>` and `<key>:<locale>`,
    // so the per-locale required field is absent from the base row by design.
    it('does not report a translatable settings page as incomplete', async () => {
        await settingsService.set({ key: 'branding', value: { company: 'Acme' } });
        await settingsService.set({ key: 'branding:en', value: { tagline: 'Hello' } });

        const report = await validateStoredContent();

        expect(report.findings).toEqual([]);
        expect(report.rowsChecked).toBe(2);
    });

    it('reports a settings blob that fails a current rule', async () => {
        await createSettingsStorage().set('branding', { company: 'Far too long' });

        const report = await validateStoredContent();

        expect(report.findings).toEqual([
            {
                kind: 'setting',
                type: null,
                id: 'branding',
                locale: null,
                fieldPath: 'company',
                message: 'Must be at most 5 characters',
            },
        ]);
    });
});

describe('validateStoredContent({ type })', () => {
    it('checks only the named entry type', async () => {
        const article = await api.create({ type: 'article', title: 'Bad' });
        const other = await api.create({ type: 'report', title: 'Also bad' });
        await storeFields(article.id, { rating: 9 });
        await storeFields(other.id, { rating: 9 });

        const report = await validateStoredContent({ type: 'article' });

        expect(report.findings.map((finding) => finding.id)).toEqual([article.id]);
        expect(report.rowsChecked).toBe(1);
    });
});
