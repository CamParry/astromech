/**
 * Dev seed — a small, field-type-exercising dataset for apps/demo/database.db.
 * Entry types and field names are read from the demo config so they cannot drift.
 * Run from the repo root: `npm run db:seed`.
 */

import { fileURLToPath } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import { collectRelationshipEdges } from 'astromech';
import type { Field } from 'astromech';
import * as schema from 'astromech/database/schema';
import { libsql } from 'astromech/database/libsql';
import config from '../../../apps/demo/astromech.config.js';

// Resolved against this file, not the cwd: `npm run db:seed` delegates with
// `-w astromech`, so a relative `./apps/demo/database.db` would not exist.
const DEFAULT_DB_URL = `file:${fileURLToPath(
    new URL('../../../apps/demo/database.db', import.meta.url)
)}`;

const db = libsql({
    url: process.env.DATABASE_URL ?? DEFAULT_DB_URL,
}).getInstance();

const PASSWORD = 'password';
const now = new Date();

/** Rows per INSERT: D1 caps a query at 100 bound parameters, and 8 × 12 = 96. */
const INDEX_CHUNK_ROWS = 12;

type SeededEntry = { id: string; type: string; fields: Record<string, unknown> };

const seededEntries: SeededEntry[] = [];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
    console.log('Seeding dev database…\n');

    await db.deleteFrom('relationships').execute();
    await db.deleteFrom('entries').execute();
    await db.deleteFrom('media').execute();
    console.log('  Cleared entries, relationships, and media\n');

    // -------------------------------------------------------------------------
    // Users
    // -------------------------------------------------------------------------
    const adminId = await upsertUser('admin@astromech.dev', 'Alex Admin');
    await upsertUser('editor@astromech.dev', 'Emma Editor');
    console.log('  Created 2 users (admin, editor)\n');

    // -------------------------------------------------------------------------
    // Media — rows only; no files are written to public/uploads.
    // -------------------------------------------------------------------------
    const mediaHeroId = crypto.randomUUID();
    const mediaPortraitId = crypto.randomUUID();
    const mediaDiagramId = crypto.randomUUID();
    const mediaLogoId = crypto.randomUUID();

    await db
        .insertInto('media')
        .values(
            (
                [
                    {
                        id: mediaHeroId,
                        filename: 'hero-banner.jpg',
                        mimeType: 'image/jpeg',
                        size: 734208,
                        width: 1920,
                        height: 1080,
                        alt: 'Hero banner',
                        fields: {
                            photographer: 'Dev Seed',
                            copyright: '© 2026 Astromech',
                            alt_text: 'Hero banner',
                        },
                        createdAt: now,
                        updatedAt: now,
                        createdBy: adminId,
                    },
                    {
                        id: mediaPortraitId,
                        filename: 'author-portrait.jpg',
                        mimeType: 'image/jpeg',
                        size: 204800,
                        width: 800,
                        height: 800,
                        alt: 'Author portrait',
                        fields: {
                            photographer: 'Dev Seed',
                            copyright: '© 2026 Astromech',
                            alt_text: 'Author portrait',
                        },
                        createdAt: now,
                        updatedAt: now,
                        createdBy: adminId,
                    },
                    {
                        id: mediaDiagramId,
                        filename: 'architecture-diagram.png',
                        mimeType: 'image/png',
                        size: 358400,
                        width: 1200,
                        height: 800,
                        alt: 'Architecture diagram',
                        fields: {
                            photographer: 'Dev Seed',
                            copyright: '© 2026 Astromech',
                            alt_text: 'Architecture diagram',
                        },
                        createdAt: now,
                        updatedAt: now,
                        createdBy: adminId,
                    },
                    {
                        id: mediaLogoId,
                        filename: 'logo-mark.png',
                        mimeType: 'image/png',
                        size: 40960,
                        width: 400,
                        height: 400,
                        alt: 'Logo mark',
                        fields: {
                            photographer: 'Dev Seed',
                            copyright: '© 2026 Astromech',
                            alt_text: 'Logo mark',
                        },
                        createdAt: now,
                        updatedAt: now,
                        createdBy: adminId,
                    },
                ] as Record<string, unknown>[]
            ).map((r) => schema.encodeWith(schema.mediaTable, r) as never)
        )
        .execute();
    console.log('  Created 4 media items\n');

    // -------------------------------------------------------------------------
    // Categories + tags — the taxonomy the posts point at.
    // -------------------------------------------------------------------------
    const catGuidesId = crypto.randomUUID();
    const catEngineeringId = crypto.randomUUID();

    await insertEntries([
        {
            id: catGuidesId,
            type: 'category',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'guides',
            title: 'Guides',
            fields: { description: 'Step-by-step walkthroughs.' },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: catEngineeringId,
            type: 'category',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'engineering',
            title: 'Engineering',
            fields: { description: 'How the internals work.' },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);

    const tagAstroId = crypto.randomUUID();
    const tagCloudflareId = crypto.randomUUID();
    const tagTypescriptId = crypto.randomUUID();

    await insertEntries([
        {
            id: tagAstroId,
            type: 'tag',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'astro',
            title: 'Astro',
            fields: { color: '#6d28d9' },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: tagCloudflareId,
            type: 'tag',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'cloudflare',
            title: 'Cloudflare',
            fields: { color: '#f97316' },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: tagTypescriptId,
            type: 'tag',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'typescript',
            title: 'TypeScript',
            fields: { color: '#3b82f6' },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);
    console.log('  Created 2 categories and 3 tags\n');

    // -------------------------------------------------------------------------
    // Authors — richtext, repeater, and a top-level media relation.
    // -------------------------------------------------------------------------
    const authorDevonId = crypto.randomUUID();
    const authorRinId = crypto.randomUUID();

    await insertEntries([
        {
            id: authorDevonId,
            type: 'author',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'devon-hart',
            title: 'Devon Hart',
            fields: {
                bio: doc(para(text('Writes the guides and breaks the demo database.'))),
                role: 'Founder',
                socials: [
                    { platform: 'github', url: 'https://github.com/astromech' },
                    { platform: 'website', url: 'https://astromech.dev' },
                ],
                avatar: mediaPortraitId,
            },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: authorRinId,
            type: 'author',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'rin-okada',
            title: 'Rin Okada',
            fields: {
                bio: doc(
                    para(text('Works on storage, migrations, and the query layer.'))
                ),
                role: 'Engineer',
                socials: [
                    { platform: 'twitter', url: 'https://twitter.com/astromechcms' },
                ],
                avatar: mediaPortraitId,
            },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);
    console.log('  Created 2 authors\n');

    // -------------------------------------------------------------------------
    // Pages — blocks (relations nested inside them), an entry relation, and the
    // Open Graph media field from the social tab.
    // -------------------------------------------------------------------------
    const pageHomeId = crypto.randomUUID();
    const pageAboutId = crypto.randomUUID();
    const pageHomeGroup = crypto.randomUUID();

    await insertEntries([
        {
            id: pageHomeId,
            type: 'page',
            locale: 'en',
            localeGroup: pageHomeGroup,
            slug: 'home',
            title: 'Home',
            fields: {
                content: [
                    {
                        _id: blockId(),
                        _type: 'hero',
                        heading: 'Every field type, once',
                        subheading: 'A dev fixture, not the marketing site.',
                        cta: { url: '/about', label: 'About', target: '_self' },
                        image: mediaHeroId,
                    },
                    {
                        _id: blockId(),
                        _type: 'featureGrid',
                        heading: 'What this seed covers',
                        features: [
                            {
                                title: 'Blocks',
                                description: 'Nested relations inside block instances.',
                                icon: 'Layers',
                            },
                            {
                                title: 'Repeaters',
                                description: 'Repeated sub-field groups.',
                                icon: 'ListTree',
                            },
                            {
                                title: 'Relations',
                                description: 'Entry, media, and multi-value relations.',
                                icon: 'Link',
                            },
                        ],
                    },
                    {
                        _id: blockId(),
                        _type: 'logoCloud',
                        heading: 'Multi-value media',
                        logos: [mediaLogoId, mediaDiagramId],
                    },
                ],
                noindex: false,
                themeColor: '#6d28d9',
                ogTitle: 'Astromech dev seed',
                ogImage: mediaHeroId,
                contentQuality: 4,
                seo: {
                    title: 'Astromech dev seed',
                    description: 'The home page of the field-type fixture.',
                },
            },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: pageAboutId,
            type: 'page',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'about',
            title: 'About',
            fields: {
                content: [
                    {
                        _id: blockId(),
                        _type: 'richText',
                        body: doc(
                            heading(2, text('About this fixture')),
                            para(
                                text(
                                    'This page exists so a page can point at another page.'
                                )
                            )
                        ),
                    },
                    {
                        _id: blockId(),
                        _type: 'twoColumn',
                        left: doc(para(text('Left column.'))),
                        right: doc(para(text('Right column.'))),
                    },
                ],
                parent: pageHomeId,
                noindex: true,
                themeColor: '#0ea5e9',
            },
            status: 'unpublished',
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);
    console.log('  Created 2 pages\n');

    // -------------------------------------------------------------------------
    // Posts — richtext body, date, and the full taxonomy sidebar.
    // -------------------------------------------------------------------------
    const post1Id = crypto.randomUUID();
    const post2Id = crypto.randomUUID();
    const post3Id = crypto.randomUUID();
    const post1Group = crypto.randomUUID();

    await insertEntries([
        {
            id: post1Id,
            type: 'post',
            locale: 'en',
            localeGroup: post1Group,
            slug: 'a-tour-of-the-field-types',
            title: 'A Tour of the Field Types',
            fields: {
                body: doc(
                    para(
                        text(
                            'Every field type the demo config declares appears somewhere in this seed, so a renderer change that breaks one of them breaks a visible page.'
                        )
                    ),
                    heading(2, text('Relations')),
                    para(
                        text(
                            'Relation ids live in field data. The relationships table is an index derived from it.'
                        )
                    )
                ),
                excerpt: 'What this fixture covers and why each field is here.',
                publishedDate: '2026-01-12',
                featured_image: mediaDiagramId,
                category: catGuidesId,
                tags: [tagAstroId, tagTypescriptId],
                author: authorDevonId,
                seo: {
                    title: 'A tour of the field types',
                    description: 'The dev seed, field by field.',
                },
            },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: post2Id,
            type: 'post',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'the-relationships-index',
            title: 'The Relationships Index',
            fields: {
                body: doc(
                    para(
                        text(
                            'The index is rebuildable: it is collected from stored field data, so a wrong row is repaired rather than lost.'
                        )
                    )
                ),
                excerpt: 'Why the index is derived and never authoritative.',
                publishedDate: '2026-02-04',
                featured_image: mediaHeroId,
                category: catEngineeringId,
                tags: [tagCloudflareId, tagTypescriptId],
                author: authorRinId,
            },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: post3Id,
            type: 'post',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'running-the-demo-locally',
            title: 'Running the Demo Locally',
            fields: {
                body: doc(
                    para(text('An unpublished post, so the admin has one to filter out.'))
                ),
                excerpt: 'Draft state, for list filtering.',
                publishedDate: '2026-03-01',
                featured_image: mediaLogoId,
                category: catGuidesId,
                tags: [tagCloudflareId],
                author: authorDevonId,
            },
            status: 'unpublished',
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);
    console.log('  Created 3 posts\n');

    // -------------------------------------------------------------------------
    // Case study — repeater, group, select, and both media relation arities.
    // -------------------------------------------------------------------------
    await insertEntries([
        {
            id: crypto.randomUUID(),
            type: 'caseStudy',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
            slug: 'field-lab',
            title: 'Field Lab',
            fields: {
                customer: 'Field Lab',
                industry: 'saas',
                summary: 'One case study, carrying every relation arity at once.',
                content: [
                    {
                        _id: blockId(),
                        _type: 'stats',
                        items: [
                            { value: '34', label: 'Indexed relations' },
                            { value: '6', label: 'Entry types' },
                        ],
                    },
                    {
                        _id: blockId(),
                        _type: 'testimonial',
                        quote: 'The seed finally matches the config.',
                        author: 'Devon Hart',
                        role: 'Founder',
                        avatar: mediaPortraitId,
                    },
                ],
                metrics: [
                    { value: '100%', label: 'Fields declared in config' },
                    { value: '0', label: 'Hand-written index rows' },
                ],
                quote: {
                    text: 'Field data is the truth; the index is a derivative.',
                    author: 'Rin Okada',
                    role: 'Engineer',
                },
                contentQuality: 5,
                logo: mediaLogoId,
                gallery: [mediaHeroId, mediaDiagramId],
                related_posts: [post1Id, post2Id],
            },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);
    console.log('  Created 1 case study\n');

    // -------------------------------------------------------------------------
    // French translations — same locale groups, own relation copies.
    // -------------------------------------------------------------------------
    await insertEntries([
        {
            id: crypto.randomUUID(),
            type: 'page',
            locale: 'fr',
            localeGroup: pageHomeGroup,
            slug: 'accueil',
            title: 'Accueil',
            fields: {
                content: [
                    {
                        _id: blockId(),
                        _type: 'hero',
                        heading: 'Chaque type de champ, une fois',
                        subheading: "Un jeu d'essai, pas le site marketing.",
                        cta: { url: '/about', label: 'À propos', target: '_self' },
                        image: mediaHeroId,
                    },
                ],
                noindex: false,
                themeColor: '#6d28d9',
                ogImage: mediaHeroId,
            },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: crypto.randomUUID(),
            type: 'post',
            locale: 'fr',
            localeGroup: post1Group,
            slug: 'visite-des-types-de-champs',
            title: 'Visite des types de champs',
            fields: {
                body: doc(
                    para(
                        text(
                            "Chaque type de champ déclaré dans la configuration de démonstration apparaît quelque part dans ce jeu d'essai."
                        )
                    )
                ),
                excerpt: "Ce que couvre ce jeu d'essai, champ par champ.",
                publishedDate: '2026-01-12',
                featured_image: mediaDiagramId,
                category: catGuidesId,
                tags: [tagAstroId, tagTypescriptId],
                author: authorDevonId,
            },
            status: 'published',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);
    console.log('  Created 2 French translations (1 page, 1 post)\n');

    // -------------------------------------------------------------------------
    // Relationships index — derived last, once every source row exists.
    // -------------------------------------------------------------------------
    await indexRelationships();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Seed complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Users         2  (admin, editor)');
    console.log('  Media         4  (rows only, no files)');
    console.log('  Categories    2  Tags  3  Authors  2');
    console.log('  Pages         2  (+1 FR)   Posts  3  (+1 FR)');
    console.log('  Case studies  1');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Login: admin@astromech.dev / password');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a credential user if the email is free; returns the user id either way. */
async function upsertUser(email: string, name: string): Promise<string> {
    const existing = await db
        .selectFrom('users')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirst();

    if (existing !== undefined) {
        return existing.id;
    }

    const userId = crypto.randomUUID();
    const hashedPassword = await hashPassword(PASSWORD);

    await db
        .insertInto('users')
        .values(
            schema.encode('users', {
                id: userId,
                email,
                name,
                emailVerified: true,
                createdAt: now,
                updatedAt: now,
            }) as never
        )
        .execute();

    await db
        .insertInto('accounts')
        .values(
            schema.encode('accounts', {
                id: crypto.randomUUID(),
                accountId: userId,
                providerId: 'credential',
                userId,
                password: hashedPassword,
                createdAt: now,
                updatedAt: now,
            }) as never
        )
        .execute();

    return userId;
}

/** Insert entry rows, recording them for the relationship-index derivation. */
async function insertEntries(rows: Record<string, unknown>[]): Promise<void> {
    await db
        .insertInto('entries')
        .values(rows.map((r) => schema.encodeWith(schema.entriesTable, r) as never))
        .execute();
    seededEntries.push(
        ...rows.map((r) => ({
            id: r.id as string,
            type: r.type as string,
            fields: (r.fields ?? {}) as Record<string, unknown>,
        }))
    );
}

/** Derive the relationships index from every seeded entry's field data. */
async function indexRelationships(): Promise<void> {
    const rows = seededEntries.flatMap((entry) =>
        collectRelationshipEdges(entryFields(entry.type), entry.fields).map(
            (edge) =>
                schema.encodeWith(schema.relationshipsTable, {
                    sourceId: entry.id,
                    sourceKind: 'entry' as const,
                    sourceType: entry.type,
                    schemaPath: edge.schemaPath,
                    instancePath: edge.instancePath,
                    targetId: edge.targetId,
                    targetKind: edge.targetKind,
                    sourceStaged: false,
                }) as never
        )
    );

    for (let i = 0; i < rows.length; i += INDEX_CHUNK_ROWS) {
        await db
            .insertInto('relationships')
            .values(rows.slice(i, i + INDEX_CHUNK_ROWS))
            .execute();
    }
    console.log(`  Indexed ${rows.length} relationships\n`);
}

/** An entry type's top-level fields, as authored in the demo config. */
function entryFields(type: string): Field[] {
    const fields = config.entries?.[type]?.fields;
    if (fields === undefined) return [];
    return Array.isArray(fields) ? fields : [...fields.main, ...(fields.sidebar ?? [])];
}

/** Stored block instances carry their own `_id`; edge paths address items by it. */
function blockId(): string {
    return crypto.randomUUID();
}

// ProseMirror JSON builders for richtext values (StarterKit schema).
type PmNode = Record<string, unknown>;

function text(value: string): PmNode {
    return { type: 'text', text: value };
}

function para(...content: PmNode[]): PmNode {
    return { type: 'paragraph', content };
}

function heading(level: number, ...content: PmNode[]): PmNode {
    return { type: 'heading', attrs: { level }, content };
}

function doc(...content: PmNode[]): PmNode {
    return { type: 'doc', content };
}

seed().catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
