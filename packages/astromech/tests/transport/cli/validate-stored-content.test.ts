/**
 * `astromech validate` — the report over stored rows.
 *
 * Rows are written through the service write paths and then rewritten behind
 * the pipeline's back (straight through the repository), because a rule that a write
 * would reject is exactly what the report exists to find.
 */

import type { AstromechConfig, JsonObject } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRepository } from '@/database/repository/create-repository';
import { entriesService as api } from '@/entries/service';
import { entryContentTable } from '@/entries/tables';
import { globalsService } from '@/globals/service';
import { globalContentTable } from '@/globals/tables';
import { validateStoredContent } from '@/transport/cli/validate-stored-content';
import { createUserRepository } from '@/users/repository';
import { usersService } from '@/users/service';

/**
 * `article` carries a bounded number and a unique code; `report` carries the
 * same code field so `--type` scoping has a second type to leave alone. Two
 * globals cover the resource with a locale per row: `branding` in the default
 * content locale alone, `site` in each configured one.
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
        globals: [
            {
                key: 'branding',
                label: 'Branding',
                fields: [
                    {
                        name: 'company',
                        type: 'text',
                        label: 'Company',
                        validation: [{ maxLength: 5 }],
                    },
                ],
            },
            {
                key: 'site',
                label: 'Site',
                translatable: true,
                fields: [
                    { name: 'tagline', type: 'text', label: 'Tagline', required: true },
                ],
            },
        ],
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeValidateConfig());
});

/** Overwrite an entry's stored field blob without going through the pipeline. */
async function storeFields(id: string, fields: JsonObject): Promise<void> {
    await createRepository(entryContentTable).updateMany({ entryId: id }, { fields });
}

/** Overwrite a global's stored field blob without going through the pipeline. */
async function storeGlobalFields(fields: JsonObject): Promise<void> {
    await createRepository(globalContentTable).updateMany({}, { fields });
}

/** Every field blob a run could touch, serialized for a straight comparison. */
async function snapshot(): Promise<string> {
    const entries = await createRepository(entryContentTable).findMany({ where: {} });
    const users = await createUserRepository().list();
    const globals = await createRepository(globalContentTable).findMany({ where: {} });
    return JSON.stringify([
        entries.map((row) => [row.id, row.fields]),
        users.map((row) => [row.id, row.fields]),
        globals.map((row) => [row.id, row.fields]),
    ]);
}

describe('validateStoredContent', () => {
    it('reports nothing for rows the write paths accepted', async () => {
        await api.create({
            type: 'article',
            data: { title: 'Fine', fields: { rating: 3, code: 'a' } },
        });
        await usersService.create({
            data: {
                email: 'owner@test.dev',
                name: 'Owner',
                fields: { nickname: 'ok' },
            },
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
            data: {
                title: 'Sections',
                fields: {
                    summary: 'S',
                    sections: [{ heading: 'One' }, { heading: 'Two' }],
                },
            },
        });
        await usersService.create({
            data: {
                email: 'owner@test.dev',
                name: 'Owner',
                fields: { nickname: 'ok' },
            },
        });
        await globalsService.update({
            key: 'branding',
            data: { fields: { company: 'Acme' } },
        });
        const before = await snapshot();

        await validateStoredContent();

        expect(await snapshot()).toEqual(before);
    });

    it('reports an out-of-range value with its path and message', async () => {
        const article = await api.create({
            type: 'article',
            data: { title: 'Too high', fields: { rating: 3 } },
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
        const article = await api.create({
            type: 'article',
            data: { title: 'Wrong shape' },
        });
        await storeFields(article.id, { rating: 'three' });

        const report = await validateStoredContent();

        expect(report.findings).toHaveLength(1);
        expect(report.findings[0]?.fieldPath).toBe('rating');
    });

    // `required` is a completeness check: a draft may be unfinished, the same
    // row published may not.
    it('validates each row at the stage its own status implies', async () => {
        const article = await api.create({ type: 'article', data: { title: 'Draft' } });

        expect((await validateStoredContent()).findings).toEqual([]);

        await createRepository(entryContentTable).updateMany(
            { entryId: article.id },
            { status: 'published' }
        );

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
            data: { title: 'One', fields: { rating: 1, code: 'only' } },
        });

        expect((await validateStoredContent()).findings).toEqual([]);
    });

    it('reports two rows that share a unique value', async () => {
        const first = await api.create({
            type: 'article',
            data: { title: 'One', fields: { code: 'dup' } },
        });
        const second = await api.create({ type: 'article', data: { title: 'Two' } });
        await storeFields(second.id, { code: 'dup' });

        const report = await validateStoredContent();

        expect(report.findings.map((finding) => finding.id).sort()).toEqual(
            [first.id, second.id].sort()
        );
        expect(report.findings.every((f) => f.message === 'Already in use')).toBe(true);
    });

    it('skips trashed rows', async () => {
        const article = await api.create({ type: 'article', data: { title: 'Gone' } });
        await storeFields(article.id, { rating: 9 });
        await api.trash({ type: 'article', id: article.id });

        expect((await validateStoredContent()).findings).toEqual([]);
    });

    it('reports a user row against the current rules', async () => {
        const user = await usersService.create({
            data: {
                email: 'long@test.dev',
                name: 'Long',
                fields: { nickname: 'ok' },
            },
        });
        await createUserRepository().update(user.id, {
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

    it('counts a clean global and reports nothing for it', async () => {
        await globalsService.update({
            key: 'branding',
            data: { fields: { company: 'Acme' } },
        });

        const report = await validateStoredContent();

        expect(report.findings).toEqual([]);
        expect(report.rowsChecked).toBe(1);
    });

    it('skips a declared global no locale has saved', async () => {
        expect((await validateStoredContent()).rowsChecked).toBe(0);
    });

    it('reports a stored global that fails a current rule', async () => {
        await globalsService.update({
            key: 'branding',
            data: { fields: { company: 'Acme' } },
        });
        await storeGlobalFields({ company: 'Far too long' });

        const report = await validateStoredContent();

        expect(report.findings).toEqual([
            {
                kind: 'global',
                type: null,
                id: 'branding',
                locale: 'en',
                fieldPath: 'company',
                message: 'Must be at most 5 characters',
            },
        ]);
    });

    // A draft is written with `required` relaxed; the report applies the
    // complete rules, so the missing field surfaces under the locale it is
    // missing from.
    it('reports each saved locale of a translatable global separately', async () => {
        await globalsService.update({ key: 'site', data: { fields: {} } });
        await globalsService.update({
            key: 'site',
            locale: 'de',
            data: { fields: { tagline: 'Hallo' } },
        });

        const report = await validateStoredContent();

        expect(report.findings).toEqual([
            {
                kind: 'global',
                type: null,
                id: 'site',
                locale: 'en',
                fieldPath: 'tagline',
                message: 'This field is required',
            },
        ]);
        expect(report.rowsChecked).toBe(2);
    });
});

describe('validateStoredContent({ type })', () => {
    it('checks only the named entry type', async () => {
        const article = await api.create({ type: 'article', data: { title: 'Bad' } });
        const other = await api.create({ type: 'report', data: { title: 'Also bad' } });
        await storeFields(article.id, { rating: 9 });
        await storeFields(other.id, { rating: 9 });

        const report = await validateStoredContent({ type: 'article' });

        expect(report.findings.map((finding) => finding.id)).toEqual([article.id]);
        expect(report.rowsChecked).toBe(1);
    });
});
