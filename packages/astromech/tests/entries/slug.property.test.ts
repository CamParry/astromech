/**
 * Slug handling, checked over generated input. `slugify` turns a title into the
 * slug an entry stores; the entry create schema and the `slug` field's
 * validator both decide what counts as a slug, so every slug `slugify` writes
 * must pass the schema, and the two must accept the same strings. The database
 * property checks that `create` never stores one slug twice in a (type,
 * locale), however the titles and explicit slugs collide.
 */

import type { FieldValidationContext } from '@/types/fields';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { createEntrySchema } from '@/entries/schema';
import { validateSlug } from '@/fields/built-in-rules';
import { slugify } from '@/utilities/strings';

/** Whether the schema `create` parses its payload with accepts this slug. */
function entrySchemaAccepts(slug: string): boolean {
    return createEntrySchema({ titled: false }).safeParse({ slug }).success;
}

/** Any text: printable ASCII, any Unicode grapheme, or raw UTF-16 units. */
const anyText = fc.oneof(
    fc.string(),
    fc.string({ unit: 'grapheme' }),
    fc.string({ unit: 'binary' })
);

/** Text with at least one ASCII letter or digit somewhere in it. */
const textWithAsciiAlphanumeric = fc
    .tuple(anyText, fc.stringMatching(/^[A-Za-z0-9]$/), anyText)
    .map(([before, alphanumeric, after]) => `${before}${alphanumeric}${after}`);

function slugContext(value: unknown): FieldValidationContext {
    return {
        value,
        values: {},
        field: { name: 'slug', type: 'slug' },
        path: [{ kind: 'field', name: 'slug' }],
        operation: 'create',
        validation: 'complete',
        resource: { kind: 'entry', record: null },
        user: null,
    };
}

describe('slugify', () => {
    it('writes an empty string or a slug the entry schema accepts', () => {
        fc.assert(
            fc.property(anyText, (title) => {
                const slug = slugify(title);
                expect(slug === '' || entrySchemaAccepts(slug)).toBe(true);
            })
        );
    });

    it('leaves a slug unchanged', () => {
        fc.assert(
            fc.property(anyText, (title) => {
                const slug = slugify(title);
                expect(slugify(slug)).toBe(slug);
            })
        );
    });

    it('never writes an empty slug for a title with an ASCII letter or digit', () => {
        fc.assert(
            fc.property(textWithAsciiAlphanumeric, (title) => {
                expect(slugify(title)).not.toBe('');
            })
        );
    });
});

describe('the slug field validator and the entry schema', () => {
    it('accept the same non-empty strings', async () => {
        const slugLike = fc.oneof(
            anyText,
            fc.stringMatching(/^[a-z0-9-]{1,12}$/),
            fc.stringMatching(/^-?[a-zA-Z0-9]{1,4}(?:-{1,2}[a-zA-Z0-9]{1,4}){0,3}-?$/)
        );
        await fc.assert(
            fc.asyncProperty(
                slugLike.filter((value) => value !== ''),
                async (value) => {
                    const validatorAccepts =
                        (await validateSlug(slugContext(value))) === true;
                    expect(validatorAccepts).toBe(entrySchemaAccepts(value));
                }
            )
        );
    });
});

describe('create', () => {
    const title = fc.oneof(
        fc.constantFrom(
            'Hello',
            'hello',
            'Hello!',
            'hello 2',
            'Hello-2',
            'HELLO 2 2',
            '!!!'
        ),
        anyText.filter((value) => value.length > 0)
    );
    const draft = fc.record(
        {
            title,
            slug: fc.constantFrom('hello', 'hello-2', 'hello-2-2', 'hello-3'),
        },
        { requiredKeys: ['title'] }
    );

    it('stores distinct slugs for every entry of one type and locale', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(draft, { minLength: 1, maxLength: 8 }),
                fc.constantFrom('en', 'de'),
                async (drafts, locale) => {
                    await createTestDb();
                    setupTestConfig(makeTestConfig());

                    const slugs: string[] = [];
                    for (const data of drafts) {
                        const entry = await currentServices.entries.create({
                            type: 'post',
                            data: { ...data, locale },
                        });
                        if (data.slug !== undefined || /[A-Za-z0-9]/.test(data.title)) {
                            expect(entry.slug).not.toBeNull();
                        }
                        if (entry.slug === null) continue;
                        expect(entrySchemaAccepts(entry.slug)).toBe(true);
                        slugs.push(entry.slug);
                    }

                    expect(new Set(slugs).size).toBe(slugs.length);
                }
            ),
            { numRuns: 20 }
        );
    });
});
