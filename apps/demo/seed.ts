/**
 * Demo marketing-site seed. Clears all content entries plus relationships,
 * globals, redirects and settings on every run; preserves auth rows and creates
 * admin@astromech.dev / password if missing. Run with `tsx demo/seed.ts`.
 */

import type { Field, JsonObject, PluginDB } from 'astromech';
import { mkdir, writeFile } from 'node:fs/promises';
import { redirectsTable } from '@astromech/redirects/tables';
import { collectRelationshipEdges, createAstromech, encodeWith } from 'astromech';
import { libsql } from 'astromech/database/libsql';
import * as schema from 'astromech/database/schema';
import { contentVersion, readImageDimensions, sharp } from 'astromech/media/image/sharp';
import { hashPassword } from 'better-auth/crypto';
import sharpLib from 'sharp';
import config from './astromech.config';

// ProseMirror JSON builders for richtext seed content (StarterKit schema)
type PmNode = Record<string, unknown>;
const text = (
    t: string,
    ...marks: ('bold' | 'italic' | 'code' | 'underline' | 'strike')[]
): PmNode =>
    marks.length
        ? { type: 'text', text: t, marks: marks.map((type) => ({ type })) }
        : { type: 'text', text: t };
const para = (...content: PmNode[]): PmNode => ({ type: 'paragraph', content });
const heading = (level: number, ...content: PmNode[]): PmNode => ({
    type: 'heading',
    attrs: { level },
    content,
});
const li = (...content: PmNode[]): PmNode => ({ type: 'listItem', content });
const ul = (...items: PmNode[]): PmNode => ({ type: 'bulletList', content: items });
const ol = (...items: PmNode[]): PmNode => ({
    type: 'orderedList',
    attrs: { start: 1 },
    content: items,
});
const codeBlock = (code: string): PmNode => ({
    type: 'codeBlock',
    attrs: { language: null },
    content: [{ type: 'text', text: code }],
});
const blockquote = (...content: PmNode[]): PmNode => ({ type: 'blockquote', content });
const link = (t: string, href: string): PmNode => ({
    type: 'text',
    text: t,
    marks: [{ type: 'link', attrs: { href } }],
});
const doc = (...content: PmNode[]): PmNode => ({ type: 'doc', content });
void blockquote;
void ol;
void link; // suppress unused-var warnings for helpers not used in current seed

const DB_PATH = new URL('./database.db', import.meta.url).pathname;

// One driver for both paths: the raw Kysely writes below and the Astromech
// runtime the globals go through. `tsx apps/demo/seed.ts` runs from the repo
// root, so a bare `libsql()` would resolve `file:./database.db` there instead.
const dbDriver = libsql({ url: `file:${DB_PATH}` });

const db = dbDriver.getInstance();

/**
 * The same handle, widened with the redirects plugin's own table. Core's `DB`
 * names core's tables only, so a plugin's have to be added by the caller;
 * `PluginDB` derives them from the plugin's `Table` objects, and the key it
 * derives is the CamelCasePlugin one, not the SQL name.
 */
const pluginDb = db.withTables<PluginDB<{ redirects: typeof redirectsTable }>>();

const now = new Date();
const PUBLISHED_AT = now;

async function upsertAdmin(): Promise<string> {
    const email = 'admin@astromech.dev';
    const existing = await db
        .selectFrom('users')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirst();

    if (existing !== undefined) {
        console.log(`  Admin user exists: ${email}`);
        return existing.id;
    }

    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const hashedPassword = await hashPassword('password');

    await db
        .insertInto('users')
        .values(
            schema.encodeWith(schema.usersTable, {
                id: userId,
                email,
                name: 'Alex Admin',
                emailVerified: true,
                role: 'admin',
                createdAt: now,
                updatedAt: now,
            })
        )
        .execute();

    // Every path that inserts a `users` row writes its content row with it.
    await db
        .insertInto('userContent')
        .values(
            schema.encodeWith(schema.userContentTable, {
                id: userId,
                userId,
                locale: 'en',
                fields: {},
                createdAt: now,
                updatedAt: now,
            })
        )
        .execute();

    await db
        .insertInto('accounts')
        .values(
            schema.encode('accounts', {
                id: accountId,
                accountId: userId,
                providerId: 'credential',
                userId,
                password: hashedPassword,
                createdAt: now,
                updatedAt: now,
            }) as never
        )
        .execute();

    console.log(`  Created admin user: ${email}`);
    return userId;
}

type SeededEntry = { id: string; type: string; fields: Record<string, unknown> };

const seededEntries: SeededEntry[] = [];
const seededEntryIds = new Set<string>();

/**
 * Insert entry rows, recording them for the relationship-index derivation.
 *
 * A row here is one locale of one entry. `entries` holds the resource (one row
 * per `id`) and `entry_content` holds the authored content (one row per locale),
 * so a translation is a second row with the same `id` and a different `locale`.
 */
async function insertEntries(rows: Record<string, unknown>[]): Promise<void> {
    const resourceRows = rows.filter((r) => !seededEntryIds.has(r.id as string));
    for (const r of resourceRows) seededEntryIds.add(r.id as string);

    if (resourceRows.length > 0) {
        await db
            .insertInto('entries')
            .values(
                resourceRows.map((r) =>
                    schema.encodeWith(schema.entriesTable, {
                        id: r.id,
                        type: r.type,
                        createdAt: r.createdAt,
                        updatedAt: r.updatedAt,
                        createdBy: r.createdBy,
                    })
                )
            )
            .execute();
    }

    await db
        .insertInto('entryContent')
        .values(
            rows.map((r) =>
                schema.encodeWith(schema.entryContentTable, {
                    entryId: r.id,
                    type: r.type,
                    locale: r.locale,
                    title: r.title,
                    slug: r.slug,
                    fields: r.fields,
                    status: r.status,
                    publishedAt: r.publishedAt,
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt,
                    createdBy: r.createdBy,
                })
            )
        )
        .execute();

    seededEntries.push(
        ...rows.map((r) => ({
            id: r.id as string,
            type: r.type as string,
            fields: (r.fields ?? {}) as Record<string, unknown>,
        }))
    );
}

/**
 * Rows per INSERT: D1 caps a query at 100 bound parameters and a relationship
 * row binds eight columns.
 */
const INDEX_CHUNK_ROWS = 12;

/** Derive the relationships index from every seeded entry's field data. */
async function indexRelationships(): Promise<void> {
    // An entry's edges are the union over its locales, deduplicated on the
    // index key — every locale of an entry shares its id, so a translation that
    // keeps a reference would otherwise collide on the primary key.
    const seen = new Set<string>();
    const rows = seededEntries.flatMap((entry) =>
        collectRelationshipEdges(entryFields(entry.type), entry.fields)
            .filter((edge) => {
                const key = `${entry.id}|${edge.instancePath}|${edge.targetId}|${edge.targetKind}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .map((edge) =>
                schema.encodeWith(schema.relationshipsTable, {
                    sourceId: entry.id,
                    sourceKind: 'entry' as const,
                    sourceType: entry.type,
                    schemaPath: edge.schemaPath,
                    instancePath: edge.instancePath,
                    targetId: edge.targetId,
                    targetKind: edge.targetKind,
                    sourceStaged: false,
                })
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

/** An entry type's top-level fields, as authored in the site config. */
function entryFields(type: string): Field[] {
    const fields = config.entries?.[type]?.fields;
    if (fields === undefined) return [];
    return Array.isArray(fields) ? fields : [...fields.main, ...(fields.sidebar ?? [])];
}

/** Clears content (keeps users / accounts / sessions / roles) and reseeds it. */
async function seed(): Promise<void> {
    console.log('Seeding demo marketing database…\n');

    const CONTENT_TYPES = ['page', 'post', 'author', 'caseStudy', 'category', 'tag'];

    // Delete relationships whose source is a content entry of these types
    const contentEntryIds = await db
        .selectFrom('entries')
        .select('id')
        .where('type', 'in', CONTENT_TYPES)
        .execute();

    const ids = contentEntryIds.map((r) => r.id);
    if (ids.length > 0) {
        await db.deleteFrom('relationships').where('sourceId', 'in', ids).execute();
    }

    // Delete old content entries (any type in the list + legacy types). Content
    // rows go first: SQLite only cascades when `foreign_keys` is on.
    const CLEARED_TYPES = [...CONTENT_TYPES, 'showcase', 'forms/form'];
    await db.deleteFrom('entryContent').where('type', 'in', CLEARED_TYPES).execute();
    await db.deleteFrom('entries').where('type', 'in', CLEARED_TYPES).execute();

    // Clear globals, settings and redirects. Deleting the `globals` row
    // cascades to its content and versions.
    await db.deleteFrom('globals').execute();
    await db.deleteFrom('settings').execute();
    await pluginDb.deleteFrom('pluginRedirectsRedirects').execute();

    // Clear leftover media rows (no files on disk referenced). Content rows go
    // first: SQLite only cascades when `foreign_keys` is on.
    await db.deleteFrom('mediaContent').execute();
    await db.deleteFrom('media').execute();

    console.log(
        '  Cleared content entries, relationships, globals, settings, redirects, media\n'
    );

    const adminId = await upsertAdmin();
    console.log();

    // Media: deterministic placeholder photos from picsum.photos, falling
    // back to a flat sharp-generated colour if the download fails.

    type Bg = { r: number; g: number; b: number };

    type MediaSpec = {
        id: string;
        filename: string;
        seed: string;
        width: number;
        height: number;
        fallbackBg: Bg;
        alt: string;
        fields: Record<string, unknown>;
    };

    /** Download a deterministic placeholder photo; null if unreachable. */
    async function fetchPlaceholder(
        seed: string,
        width: number,
        height: number
    ): Promise<Buffer | null> {
        try {
            const res = await fetch(
                `https://picsum.photos/seed/${seed}/${width}/${height}`,
                { redirect: 'follow', signal: AbortSignal.timeout(20000) }
            );
            if (!res.ok) return null;
            return Buffer.from(await res.arrayBuffer());
        } catch {
            return null;
        }
    }

    /** The resource row and its default-locale content row, as one pair. */
    type SeededMedia = {
        media: schema.NewMediaTableRow;
        content: schema.NewMediaContentRow;
    };

    async function seedMedia(spec: MediaSpec): Promise<SeededMedia> {
        let buf = await fetchPlaceholder(spec.seed, spec.width, spec.height);
        const downloaded = buf !== null;
        if (!buf) {
            // Offline fallback — a flat colour so the row + file still exist.
            buf = await sharpLib({
                create: {
                    width: spec.width,
                    height: spec.height,
                    channels: 3,
                    background: spec.fallbackBg,
                },
            })
                .jpeg({ quality: 80 })
                .toBuffer();
        }
        if (!downloaded)
            console.log(`    ! ${spec.filename}: download failed, used fallback`);

        const bytes = new Uint8Array(buf);

        const uploadsDir = new URL('./public/uploads/', import.meta.url);
        await mkdir(uploadsDir, { recursive: true });
        await writeFile(new URL(`${spec.id}.jpg`, uploadsDir), buf);

        const dims = readImageDimensions(bytes);
        const version = await contentVersion(bytes);
        // `placeholder` is optional on the ImageDriver contract, so it is called
        // the same way `media/service.ts` calls it.
        const blurhash = (await sharp().placeholder?.(bytes)) ?? null;

        return {
            media: {
                id: spec.id,
                filename: spec.filename,
                mimeType: 'image/jpeg',
                size: buf.length,
                width: dims?.width ?? spec.width,
                height: dims?.height ?? spec.height,
                metadata: { version, blurhash },
                createdAt: now,
                updatedAt: now,
                createdBy: adminId,
                updatedBy: adminId,
            },
            content: {
                id: crypto.randomUUID(),
                mediaId: spec.id,
                locale: 'en',
                alt: spec.alt,
                fields: spec.fields,
                createdAt: now,
                updatedAt: now,
                createdBy: adminId,
                updatedBy: adminId,
            },
        };
    }

    // The three content-referenced images (used by entries below) keep stable vars.
    const mediaHeroId = crypto.randomUUID();
    const mediaDashboardId = crypto.randomUUID();
    const mediaTeamId = crypto.randomUUID();

    const meta = (alt_text: string) => ({
        photographer: 'Picsum Placeholder',
        copyright: '© 2026 Astromech',
        alt_text,
    });

    const mediaSpecs: MediaSpec[] = [
        {
            id: mediaHeroId,
            filename: 'astromech-hero.jpg',
            seed: 'astromech-hero',
            width: 1920,
            height: 1080,
            fallbackBg: { r: 109, g: 40, b: 217 },
            alt: 'Astromech CMS hero',
            fields: meta('Astromech CMS hero image'),
        },
        {
            id: mediaDashboardId,
            filename: 'astromech-dashboard.jpg',
            seed: 'astromech-dashboard',
            width: 1280,
            height: 800,
            fallbackBg: { r: 37, g: 99, b: 235 },
            alt: 'Astromech admin dashboard',
            fields: meta('Astromech admin dashboard screenshot'),
        },
        {
            id: mediaTeamId,
            filename: 'astromech-team.jpg',
            seed: 'astromech-team',
            width: 800,
            height: 600,
            fallbackBg: { r: 13, g: 148, b: 136 },
            alt: 'Astromech team',
            fields: meta('The Astromech team'),
        },
        // Extra placeholder photos to populate the media library.
        {
            id: crypto.randomUUID(),
            filename: 'mountain-vista.jpg',
            seed: 'mountain-vista',
            width: 1600,
            height: 1000,
            fallbackBg: { r: 71, g: 85, b: 105 },
            alt: 'Mountain vista at dawn',
            fields: meta('Mountain vista at dawn'),
        },
        {
            id: crypto.randomUUID(),
            filename: 'city-skyline.jpg',
            seed: 'city-skyline',
            width: 1600,
            height: 900,
            fallbackBg: { r: 30, g: 41, b: 59 },
            alt: 'City skyline at night',
            fields: meta('City skyline at night'),
        },
        {
            id: crypto.randomUUID(),
            filename: 'workspace-desk.jpg',
            seed: 'workspace-desk',
            width: 1200,
            height: 1200,
            fallbackBg: { r: 120, g: 113, b: 108 },
            alt: 'Tidy workspace desk',
            fields: meta('Tidy workspace desk'),
        },
        {
            id: crypto.randomUUID(),
            filename: 'coastal-cliffs.jpg',
            seed: 'coastal-cliffs',
            width: 1200,
            height: 1500,
            fallbackBg: { r: 14, g: 116, b: 144 },
            alt: 'Coastal cliffs (portrait)',
            fields: meta('Coastal cliffs portrait'),
        },
        {
            id: crypto.randomUUID(),
            filename: 'forest-path.jpg',
            seed: 'forest-path',
            width: 1600,
            height: 1067,
            fallbackBg: { r: 22, g: 101, b: 52 },
            alt: 'Forest path in autumn',
            fields: meta('Forest path in autumn'),
        },
        {
            id: crypto.randomUUID(),
            filename: 'abstract-texture.jpg',
            seed: 'abstract-texture',
            width: 1400,
            height: 1400,
            fallbackBg: { r: 168, g: 85, b: 247 },
            alt: 'Abstract colour texture',
            fields: meta('Abstract colour texture'),
        },
    ];

    const mediaRows = await Promise.all(mediaSpecs.map(seedMedia));

    await db
        .insertInto('media')
        .values(
            mediaRows.map((r) =>
                schema.encodeWith(schema.mediaTable, r.media as Record<string, unknown>)
            )
        )
        .execute();
    await db
        .insertInto('mediaContent')
        .values(
            mediaRows.map((r) =>
                schema.encodeWith(
                    schema.mediaContentTable,
                    r.content as Record<string, unknown>
                )
            )
        )
        .execute();
    console.log(`  Created ${mediaRows.length} media items\n`);

    const catEngineeringId = crypto.randomUUID();
    const catProductId = crypto.randomUUID();
    const catCommunityId = crypto.randomUUID();
    const catTutorialsId = crypto.randomUUID();

    await insertEntries([
        {
            id: catEngineeringId,
            type: 'category',
            locale: 'en',
            slug: 'engineering',
            title: 'Engineering',
            fields: {
                description:
                    'Deep dives into how Astromech is built and how to extend it.',
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: catProductId,
            type: 'category',
            locale: 'en',
            slug: 'product',
            title: 'Product',
            fields: {
                description: 'News, updates, and behind-the-scenes product decisions.',
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: catCommunityId,
            type: 'category',
            locale: 'en',
            slug: 'community',
            title: 'Community',
            fields: {
                description: 'Stories from teams building with Astromech.',
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: catTutorialsId,
            type: 'category',
            locale: 'en',
            slug: 'tutorials',
            title: 'Tutorials',
            fields: {
                description: 'Step-by-step guides to get the most out of Astromech.',
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ] as Record<string, unknown>[]);
    console.log('  Created 4 categories\n');

    const tagAstroId = crypto.randomUUID();
    const tagCloudflareId = crypto.randomUUID();
    const tagTypescriptId = crypto.randomUUID();
    const tagHeadlessCmsId = crypto.randomUUID();
    const tagEdgeId = crypto.randomUUID();

    await insertEntries([
        {
            id: tagAstroId,
            type: 'tag',
            locale: 'en',
            slug: 'astro',
            title: 'Astro',
            fields: { color: '#6d28d9' },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: tagCloudflareId,
            type: 'tag',
            locale: 'en',
            slug: 'cloudflare',
            title: 'Cloudflare',
            fields: { color: '#f97316' },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: tagTypescriptId,
            type: 'tag',
            locale: 'en',
            slug: 'typescript',
            title: 'TypeScript',
            fields: { color: '#3b82f6' },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: tagHeadlessCmsId,
            type: 'tag',
            locale: 'en',
            slug: 'headless-cms',
            title: 'Headless CMS',
            fields: { color: '#10b981' },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: tagEdgeId,
            type: 'tag',
            locale: 'en',
            slug: 'edge',
            title: 'Edge',
            fields: { color: '#f59e0b' },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ] as Record<string, unknown>[]);
    console.log('  Created 5 tags\n');

    // Authors: the title column holds the author name.
    const authorAlexId = crypto.randomUUID();
    const authorPriyaId = crypto.randomUUID();
    const authorTomId = crypto.randomUUID();

    await insertEntries([
        {
            id: authorAlexId,
            type: 'author',
            locale: 'en',
            slug: 'alex-morgan',
            title: 'Alex Morgan',
            fields: {
                bio: doc(
                    para(
                        text(
                            'Alex is the founder of Astromech and a long-time contributor to the Astro ecosystem. Passionate about developer experience and edge computing.'
                        )
                    )
                ),
                role: 'Founder & CEO',
                socials: [
                    {
                        platform: 'twitter',
                        url: 'https://twitter.com/astromechcms',
                    },
                    {
                        platform: 'github',
                        url: 'https://github.com/astromech',
                    },
                ],
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: authorPriyaId,
            type: 'author',
            locale: 'en',
            slug: 'priya-sharma',
            title: 'Priya Sharma',
            fields: {
                bio: doc(
                    para(
                        text(
                            'Priya leads product at Astromech. Former Contentful engineer with a deep interest in content modelling and workflow design.'
                        )
                    )
                ),
                role: 'Head of Product',
                socials: [
                    {
                        platform: 'linkedin',
                        url: 'https://linkedin.com/in/priyasharma',
                    },
                    {
                        platform: 'twitter',
                        url: 'https://twitter.com/priya_builds',
                    },
                ],
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: authorTomId,
            type: 'author',
            locale: 'en',
            slug: 'tom-rivers',
            title: 'Tom Rivers',
            fields: {
                bio: doc(
                    para(
                        text(
                            'Tom is a senior engineer at Astromech, focused on the Cloudflare Workers runtime and D1 storage layer. Open source contributor and database enthusiast.'
                        )
                    )
                ),
                role: 'Senior Engineer',
                socials: [
                    {
                        platform: 'github',
                        url: 'https://github.com/tomrivers',
                    },
                    { platform: 'website', url: 'https://tomrivers.dev' },
                ],
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ] as Record<string, unknown>[]);
    console.log('  Created 3 authors\n');

    const pageHomeId = crypto.randomUUID();
    const pageFeaturesId = crypto.randomUUID();
    const pagePricingId = crypto.randomUUID();
    const pageAboutId = crypto.randomUUID();

    // Block _id helper
    const bid = () => crypto.randomUUID();

    await insertEntries([
        {
            id: pageHomeId,
            type: 'page',
            locale: 'en',
            slug: 'home',
            title: 'Home',
            fields: {
                content: [
                    {
                        _id: bid(),
                        _type: 'hero',
                        heading: 'The CMS built for the modern web',
                        subheading:
                            'Astromech runs on Cloudflare Workers, stores content in D1, and ships a zero-JS admin panel — so you can focus on shipping your product.',
                        cta: {
                            url: '/features',
                            label: 'See the features',
                            target: '_self',
                        },
                    },
                    {
                        _id: bid(),
                        _type: 'featureGrid',
                        heading: "Everything you need. Nothing you don't.",
                        features: [
                            {
                                title: 'Edge-native',
                                description:
                                    'Runs directly on Cloudflare Workers — no cold starts, sub-millisecond response times from 300+ cities.',
                                icon: 'Zap',
                            },
                            {
                                title: 'Type-safe content',
                                description:
                                    'Your schema lives in TypeScript. The SDK generates fully typed clients automatically from your config.',
                                icon: 'Code2',
                            },
                            {
                                title: 'Bilingual out of the box',
                                description:
                                    'First-class locale support with a symmetric locale model. No plugins, no hacks — just a clean API.',
                                icon: 'Globe',
                            },
                            {
                                title: 'Deploy anywhere',
                                description:
                                    'Cloudflare D1 in production, SQLite locally. Swap drivers with a one-line config change.',
                                icon: 'Server',
                            },
                            {
                                title: 'Plugin architecture',
                                description:
                                    'First-party plugins for SEO, redirects, and more. Write your own in minutes — the plugin API is public.',
                                icon: 'Puzzle',
                            },
                            {
                                title: 'Built on standards',
                                description:
                                    'Astro, Hono, TanStack Router, Drizzle ORM, Better Auth. Industry-standard tools you already know.',
                                icon: 'Layers',
                            },
                        ],
                    },
                    {
                        _id: bid(),
                        _type: 'logoCloud',
                        heading: 'Trusted by teams building on',
                        logos: [],
                    },
                    {
                        _id: bid(),
                        _type: 'testimonial',
                        quote: "Astromech replaced three separate tools for us. We're shipping content updates faster than ever, and our editors love the clean UI.",
                        author: 'Sara Chen',
                        role: 'CTO, Lumenflow',
                    },
                    {
                        _id: bid(),
                        _type: 'cta',
                        heading: 'Ready to simplify your stack?',
                        text: 'Astromech is open source. Star us on GitHub or get started in under five minutes.',
                        button: {
                            url: '/pricing',
                            label: 'Get started free',
                            target: '_self',
                        },
                    },
                ],
                noindex: false,
                themeColor: '#6d28d9',
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },

        {
            id: pageFeaturesId,
            type: 'page',
            locale: 'en',
            slug: 'features',
            title: 'Features',
            fields: {
                content: [
                    {
                        _id: bid(),
                        _type: 'hero',
                        heading: 'A CMS that works the way you do',
                        subheading:
                            'Flexible content modelling, a beautiful admin UI, and a server SDK that reads like plain TypeScript.',
                        cta: {
                            url: '/pricing',
                            label: 'Start free',
                            target: '_self',
                        },
                    },
                    {
                        _id: bid(),
                        _type: 'featureGrid',
                        heading: 'Content modelling',
                        features: [
                            {
                                title: 'Rich field types',
                                description:
                                    'Text, richtext, media, relationships, repeaters, blocks, selects, booleans, colors, dates, links — all first-class.',
                                icon: 'ListTree',
                            },
                            {
                                title: 'Blocks system',
                                description:
                                    'Compose pages from reusable block types. Each block is typed, draggable, and renders to a dedicated component.',
                                icon: 'LayoutTemplate',
                            },
                            {
                                title: 'Versioning',
                                description:
                                    'Automatic version history on any entry type. Restore any previous state with one click.',
                                icon: 'History',
                            },
                        ],
                    },
                    {
                        _id: bid(),
                        _type: 'twoColumn',
                        left: doc(
                            heading(3, text('Admin panel')),
                            para(
                                text(
                                    'A fast, keyboard-navigable admin built with TanStack Router and React. Command palette, live search, and a plugin-aware sidebar — shipped as a single JavaScript bundle alongside your Worker.'
                                )
                            )
                        ),
                        right: doc(
                            heading(3, text('Server SDK')),
                            para(
                                text('Call '),
                                text('getAstromech()', 'code'),
                                text(
                                    ' in your Astro pages and query content directly — no HTTP round-trips. Every method is typed from your schema. No code generation step, no build-time magic.'
                                )
                            )
                        ),
                    },
                    {
                        _id: bid(),
                        _type: 'stats',
                        items: [
                            { value: '<1ms', label: 'P50 query latency' },
                            { value: '300+', label: 'Edge locations' },
                            { value: '0', label: 'Cold starts' },
                            { value: '100%', label: 'TypeScript' },
                        ],
                    },
                    {
                        _id: bid(),
                        _type: 'faq',
                        heading: 'Common questions',
                        items: [
                            {
                                question: 'Can I use Astromech without Cloudflare?',
                                answer: 'Yes. The default driver is libSQL (Turso-compatible), which works anywhere Node.js or Bun runs. The Cloudflare D1 driver is opt-in.',
                            },
                            {
                                question: 'Does Astromech support custom field types?',
                                answer: 'Via plugins. A plugin can define new field renderers, admin pages, and SDK methods — all typed end-to-end.',
                            },
                            {
                                question: 'How does media storage work?',
                                answer: 'Files are written to R2 in production (or the filesystem locally). Media records in D1 store metadata and a public URL.',
                            },
                        ],
                    },
                ],
                noindex: false,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },

        {
            id: pagePricingId,
            type: 'page',
            locale: 'en',
            slug: 'pricing',
            title: 'Pricing',
            fields: {
                content: [
                    {
                        _id: bid(),
                        _type: 'hero',
                        heading: 'Simple, honest pricing',
                        subheading:
                            'Astromech is open source. Host it yourself for free, or let us run it for you on managed infrastructure.',
                        cta: {
                            url: 'https://github.com/astromech',
                            label: 'View on GitHub',
                            target: '_blank',
                        },
                    },
                    {
                        _id: bid(),
                        _type: 'richText',
                        body: doc(
                            heading(2, text('Self-hosted (free)')),
                            para(
                                text(
                                    "Clone the repo, configure your Cloudflare account, and deploy. You pay only Cloudflare's usage costs — typically a few dollars per month for a busy site."
                                )
                            ),
                            heading(2, text('Managed (coming soon)')),
                            para(
                                text(
                                    'We handle deployments, migrations, backups, and monitoring. Pricing will be usage-based with a generous free tier. Join the waitlist to be first to know.'
                                )
                            )
                        ),
                    },
                    {
                        _id: bid(),
                        _type: 'cta',
                        heading: 'Get started today',
                        text: 'Read the docs and have your first Astromech project running in under five minutes.',
                        button: {
                            url: 'https://docs.astromech.dev',
                            label: 'Read the docs',
                            target: '_blank',
                        },
                    },
                ],
                noindex: false,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },

        {
            id: pageAboutId,
            type: 'page',
            locale: 'en',
            slug: 'about',
            title: 'About',
            fields: {
                content: [
                    {
                        _id: bid(),
                        _type: 'hero',
                        heading: 'Built by developers, for developers',
                        subheading:
                            'We started Astromech because we were tired of CMSes that felt like they were fighting us. We wanted something that felt like code — because it is.',
                    },
                    {
                        _id: bid(),
                        _type: 'richText',
                        body: doc(
                            heading(2, text('Our story')),
                            para(
                                text(
                                    "Astromech started as an internal tool for a small web agency. We kept reaching for the same patterns — a headless CMS that understood TypeScript, deployed to the edge, and didn't charge per seat. Nothing fit. So we built it."
                                )
                            ),
                            para(
                                text(
                                    'We open-sourced Astromech in 2025 and have been growing ever since. Today hundreds of projects use Astromech in production, from personal blogs to large editorial teams at media companies.'
                                )
                            ),
                            heading(2, text('Our values')),
                            ul(
                                li(
                                    para(
                                        text('Developer experience first', 'bold'),
                                        text(
                                            ' — every API decision is made by asking “what would a developer want this to feel like?”'
                                        )
                                    )
                                ),
                                li(
                                    para(
                                        text('No lock-in', 'bold'),
                                        text(
                                            ' — your content schema is code you own. Export it, migrate it, self-host it.'
                                        )
                                    )
                                ),
                                li(
                                    para(
                                        text('Performance by default', 'bold'),
                                        text(
                                            ' — the edge is not optional. Slow CMSes make slow sites.'
                                        )
                                    )
                                )
                            )
                        ),
                    },
                    {
                        _id: bid(),
                        _type: 'cta',
                        heading: 'Come build with us',
                        text: 'Astromech is open source and we welcome contributions of all sizes.',
                        button: {
                            url: 'https://github.com/astromech/astromech',
                            label: 'Star on GitHub',
                            target: '_blank',
                        },
                    },
                ],
                noindex: false,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ] as Record<string, unknown>[]);
    console.log('  Created 4 pages (home, features, pricing, about)\n');

    const post1Id = crypto.randomUUID();
    const post2Id = crypto.randomUUID();
    const post3Id = crypto.randomUUID();
    const post4Id = crypto.randomUUID();
    const post5Id = crypto.randomUUID();
    const post6Id = crypto.randomUUID();

    await insertEntries([
        {
            id: post1Id,
            type: 'post',
            locale: 'en',
            slug: 'why-we-chose-cloudflare-workers',
            title: 'Why We Chose Cloudflare Workers for Astromech',
            fields: {
                body: doc(
                    para(
                        text(
                            "When we started designing Astromech's deployment model, we had three options: a traditional VPS, a serverless function platform like Lambda or Vercel, or Cloudflare Workers. We chose Cloudflare Workers — and it has shaped every architectural decision since."
                        )
                    ),
                    heading(2, text('No cold starts')),
                    para(
                        text(
                            'Lambda and Vercel Functions boot a Node.js process on each request after a period of inactivity. For a CMS admin panel, this means the first page load after lunch can take two or three seconds. Workers run on V8 isolates: no process boot, no module resolution at startup. Every request hits a warm runtime.'
                        )
                    ),
                    heading(2, text('Global by default')),
                    para(
                        text(
                            "Workers deploy to 300+ cities simultaneously. Astromech queries D1 — Cloudflare's SQLite service — which replicates reads globally. The result is sub-millisecond query latency almost anywhere on earth."
                        )
                    ),
                    heading(2, text('The cost model')),
                    para(
                        text(
                            'Workers pricing is request-based with a generous free tier (100,000 requests/day). For most Astromech installations, the monthly bill is below $5. Compare that to a $20/month VPS sitting idle 90% of the time.'
                        )
                    )
                ),
                excerpt:
                    'The technical and economic reasons behind our decision to build Astromech on Cloudflare Workers and D1.',
                publishedDate: '2025-11-10',
                category: catEngineeringId,
                tags: [tagCloudflareId, tagEdgeId],
                author: authorTomId,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: post2Id,
            type: 'post',
            locale: 'en',
            slug: 'building-a-blocks-system-in-typescript',
            title: 'Building a Type-Safe Blocks System in TypeScript',
            fields: {
                body: doc(
                    para(
                        text(
                            'Page builders are notoriously hard to make type-safe. A block can be one of many shapes, the list of block types is user-defined, and both the admin UI and the front-end renderer need to agree on the shape of each block at compile time.'
                        )
                    ),
                    para(
                        text('In Astromech, the blocks field is defined in your config:')
                    ),
                    codeBlock("fields.blocks('content', { blocks: blockCatalog })"),
                    para(
                        text('Each block in the catalog is a '),
                        text('block(type, { fields: [...] })', 'code'),
                        text(
                            ' call. The type parameter is a string literal; the fields array determines the shape. At build time, Astromech generates a discriminated union from the catalog so your Astro components get fully typed props. Each stored block carries reserved, underscore-prefixed keys ('
                        ),
                        text('_type', 'code'),
                        text(', '),
                        text('_id', 'code'),
                        text(', optional '),
                        text('_disabled', 'code'),
                        text(') so they never collide with your own field names:')
                    ),
                    codeBlock(
                        "type ContentBlock =\n  | { _type: 'hero'; heading: string; subheading?: string; cta?: Link }\n  | { _type: 'richText'; body: string }\n  | { _type: 'featureGrid'; heading?: string; features: Feature[] }\n  // ..."
                    ),
                    para(
                        text('The Blocks dispatcher component switches on '),
                        text('block._type', 'code'),
                        text(
                            ' and TypeScript narrows to the correct shape in each branch — no type assertions required.'
                        )
                    )
                ),
                excerpt:
                    'How Astromech implements a fully type-safe blocks system from schema definition to front-end rendering.',
                publishedDate: '2025-12-03',
                category: catEngineeringId,
                tags: [tagTypescriptId, tagAstroId],
                author: authorAlexId,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: post3Id,
            type: 'post',
            locale: 'en',
            slug: 'symmetric-locale-model-explained',
            title: 'The Symmetric Locale Model: i18n Without the Complexity',
            fields: {
                body: doc(
                    para(
                        text(
                            'Most headless CMSes bolt i18n on after the fact. The result is an asymmetric model where one locale is "primary" and others are "translations of" that primary — a hierarchy that breaks down the moment you want to create a locale variant that diverges significantly from the source.'
                        )
                    ),
                    para(
                        text(
                            'Astromech uses a symmetric locale model: every locale of an entry is a peer. An entry has one id, and each locale is a row of content under it — no locale is more canonical than another. You can write the French first and add the English later. You can have Spanish without English.'
                        )
                    ),
                    heading(2, text('The API')),
                    para(
                        text('When you query entries, you pass a '),
                        text('locale', 'code'),
                        text(' option and get back that locale of each entry. The '),
                        text('entry.locales', 'code'),
                        text(
                            ' field lists every locale the entry has been written in — useful for rendering '
                        ),
                        text('<hreflang>', 'code'),
                        text(' alternates.')
                    ),
                    para(
                        text('Creating a translation is '),
                        text(
                            "entries.update({ type, id, locale: 'fr', data: { ... } })",
                            'code'
                        ),
                        text(
                            '. One line, against the id you already have. No special "translate" method, no source/target semantics.'
                        )
                    )
                ),
                excerpt:
                    'How the symmetric locale model in Astromech lets you add i18n without giving up flexibility.',
                publishedDate: '2026-01-15',
                category: catProductId,
                tags: [tagHeadlessCmsId],
                author: authorPriyaId,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: post4Id,
            type: 'post',
            locale: 'en',
            slug: 'plugin-architecture-deep-dive',
            title: 'Astromech Plugin Architecture: A Deep Dive',
            fields: {
                body: doc(
                    para(
                        text(
                            'Astromech ships two first-party plugins — SEO and Redirects — and the plugin API is entirely public. This post walks through how plugins work, what they can extend, and how to write one from scratch.'
                        )
                    ),
                    heading(2, text('What a plugin can do')),
                    ul(
                        li(
                            para(
                                text('Schema', 'bold'),
                                text(
                                    ': add Drizzle tables that migrate alongside core tables.'
                                )
                            )
                        ),
                        li(
                            para(
                                text('Entry types', 'bold'),
                                text(
                                    ': register custom entry types with their own repository (including custom SQLite tables).'
                                )
                            )
                        ),
                        li(
                            para(
                                text('Admin pages', 'bold'),
                                text(
                                    ': add sidebar entries and settings forms to the admin panel.'
                                )
                            )
                        ),
                        li(
                            para(
                                text('Hooks', 'bold'),
                                text(': subscribe to '),
                                text('entry:beforeCreate', 'code'),
                                text(', '),
                                text('entry:afterUpdate', 'code'),
                                text(', and more.')
                            )
                        ),
                        li(
                            para(
                                text('SDK methods', 'bold'),
                                text(': expose typed methods on the '),
                                text('Astromech.plugins.yourPlugin', 'code'),
                                text(' namespace.')
                            )
                        )
                    ),
                    heading(2, text('Plugin identity')),
                    para(
                        text('A plugin declares a '),
                        text('package', 'code'),
                        text(
                            ' name (its npm package name). Astromech derives the permission namespace, table prefix, and schema module path from this single string — no manual configuration.'
                        )
                    ),
                    para(
                        text(
                            'The result is a plugin system where first-party and third-party plugins are indistinguishable to the host application.'
                        )
                    )
                ),
                excerpt:
                    'A complete walkthrough of the Astromech plugin system — what plugins can extend, and how to write one.',
                publishedDate: '2026-02-20',
                category: catEngineeringId,
                tags: [tagTypescriptId, tagHeadlessCmsId],
                author: authorAlexId,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: post5Id,
            type: 'post',
            locale: 'en',
            slug: 'getting-started-with-astromech',
            title: 'Getting Started with Astromech in 5 Minutes',
            fields: {
                body: doc(
                    para(
                        text(
                            "This tutorial walks you from zero to a working Astromech installation in under five minutes. You'll need Node.js 20+, an Astro project, and a Cloudflare account (or skip that for local-only development)."
                        )
                    ),
                    heading(2, text('Install')),
                    codeBlock('npm install astromech'),
                    heading(2, text('Configure')),
                    para(
                        text('Create '),
                        text('astromech.config.ts', 'code'),
                        text(' in your project root:')
                    ),
                    codeBlock(
                        "import { defineConfig } from 'astromech';\nimport { libsql } from 'astromech/database/libsql';\nimport * as fields from 'astromech/fields';\n\nexport default defineConfig({\n  db: libsql({ url: 'file:./database.db' }),\n  entries: {\n    post: {\n      single: 'Post',\n      plural: 'Posts',\n      fields: [\n        fields.richtext('body', { required: true }),\n        fields.textarea('excerpt'),\n      ],\n    },\n  },\n});\n"
                    ),
                    heading(2, text('Initialise the DB')),
                    codeBlock(
                        'npx astromech db:init\nnpx astromech users:create --email you@example.com --password secret'
                    ),
                    heading(2, text('Query content')),
                    para(text('In your Astro page:')),
                    codeBlock(
                        "import { getAstromech } from 'astromech';\nconst app = await getAstromech();\nconst { data: posts } = await app.entries.query({ type: 'post', locale: 'en' });\n"
                    ),
                    para(text("That's it. Your CMS is running."))
                ),
                excerpt:
                    'Install, configure, and query your first Astromech content in under five minutes.',
                publishedDate: '2026-03-01',
                category: catTutorialsId,
                tags: [tagAstroId, tagCloudflareId],
                author: authorTomId,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: post6Id,
            type: 'post',
            locale: 'en',
            slug: 'seo-plugin-walkthrough',
            title: 'The SEO Plugin: Meta Tags, Sitemaps, and hreflang',
            fields: {
                body: doc(
                    para(
                        text(
                            'Search engine optimisation in a headless CMS requires careful attention to meta tags, canonical URLs, and locale alternates. The Astromech SEO plugin handles all three — and is designed to compose cleanly with the blocks system and the symmetric locale model.'
                        )
                    ),
                    heading(2, text('The seoSection field group')),
                    para(
                        text('Add '),
                        text('seoSection()', 'code'),
                        text(
                            " to any entry type's fields to get a collapsible group with title, description, canonical URL override, and robots fields. All per-locale, all editable in the admin without code."
                        )
                    ),
                    heading(2, text('Reading SEO data')),
                    para(
                        text('Call '),
                        text('Astromech.plugins.seo.meta({ entry, locale })', 'code'),
                        text(
                            ' to get a resolved object with title, description, og:title, og:description, and canonical. Pass it to your '
                        ),
                        text('<Seo>', 'code'),
                        text(' component.')
                    ),
                    heading(2, text('Sitemap')),
                    para(
                        text('Astromech.plugins.seo.sitemap()', 'code'),
                        text(
                            ' returns all published entries with their URLs and locale alternates formatted for a '
                        ),
                        text('sitemap.xml', 'code'),
                        text(" response. Add a single Astro route and you're done.")
                    )
                ),
                excerpt:
                    'How the Astromech SEO plugin provides meta tags, sitemap generation, and hreflang support out of the box.',
                publishedDate: '2026-03-15',
                category: catTutorialsId,
                tags: [tagHeadlessCmsId, tagAstroId],
                author: authorPriyaId,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ] as Record<string, unknown>[]);

    console.log('  Created 6 posts (en)\n');

    const cs1Id = crypto.randomUUID();
    const cs2Id = crypto.randomUUID();
    const cs3Id = crypto.randomUUID();

    await insertEntries([
        {
            id: cs1Id,
            type: 'caseStudy',
            locale: 'en',
            slug: 'lumenflow',
            title: 'Lumenflow',
            fields: {
                customer: 'Lumenflow',
                industry: 'saas',
                summary:
                    'Lumenflow replaced a custom WordPress multisite with Astromech, reducing editorial time by 60% and page load time by 4×.',
                content: [
                    {
                        _id: bid(),
                        _type: 'richText',
                        body: doc(
                            para(
                                text(
                                    'Lumenflow is a B2B SaaS company with editorial teams in four countries. Their previous setup — a WordPress multisite with custom plugins — required a dedicated DevOps engineer just to keep running. Translation workflows lived in spreadsheets. Publishing required a manual approval email chain.'
                                )
                            ),
                            para(
                                text(
                                    'After migrating to Astromech, the team ships content updates directly from the admin panel. The symmetric locale model means their French, German, and Japanese editors work in parallel without stepping on each other. Deployment takes seconds, not minutes.'
                                )
                            )
                        ),
                    },
                    {
                        _id: bid(),
                        _type: 'stats',
                        items: [
                            {
                                value: '60%',
                                label: 'Reduction in editorial time',
                            },
                            { value: '4×', label: 'Faster page loads' },
                            { value: '0', label: 'Server maintenance hours' },
                        ],
                    },
                ],
                metrics: [
                    { value: '60%', label: 'Faster publishing workflow' },
                    { value: '4×', label: 'Page speed improvement' },
                    { value: '$0', label: 'Infrastructure overhead' },
                ],
                quote: {
                    text: 'Astromech replaced three separate tools for us. Our editors love the clean UI and the translation workflow is finally sane.',
                    author: 'Sara Chen',
                    role: 'CTO, Lumenflow',
                },
                related_posts: [post3Id, post5Id],
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: cs2Id,
            type: 'caseStudy',
            locale: 'en',
            slug: 'pixel-agency',
            title: 'Pixel Agency',
            fields: {
                customer: 'Pixel Agency',
                industry: 'agency',
                summary:
                    'Pixel Agency uses Astromech as a white-label CMS platform across 40+ client projects, with custom plugins for brand-specific workflows.',
                content: [
                    {
                        _id: bid(),
                        _type: 'richText',
                        body: doc(
                            para(
                                text(
                                    'Running a CMS at agency scale means one system must serve forty different clients, each with unique content models, brand guidelines, and editorial permissions. Pixel Agency evaluated six headless CMSes before choosing Astromech for its plugin architecture and the ability to deploy isolated instances per client on a single Cloudflare account.'
                                )
                            ),
                            para(
                                text(
                                    "They built three internal plugins — one for brand asset management, one for approval workflows, and one for a client-facing preview portal. Each plugin hooks into Astromech's admin panel and SDK without forking the core codebase."
                                )
                            )
                        ),
                    },
                    {
                        _id: bid(),
                        _type: 'testimonial',
                        quote: 'The plugin API made us feel like first-class citizens. We extended the admin without touching core — and those plugins have survived four major Astromech updates without a single breaking change.',
                        author: 'Marcus Webb',
                        role: 'Technical Director, Pixel Agency',
                    },
                ],
                metrics: [
                    { value: '40+', label: 'Client projects' },
                    { value: '3', label: 'Custom plugins built' },
                    { value: '0', label: 'Core forks' },
                ],
                quote: {
                    text: 'The plugin API made us feel like first-class citizens. We extended the admin without touching core.',
                    author: 'Marcus Webb',
                    role: 'Technical Director, Pixel Agency',
                },
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: cs3Id,
            type: 'caseStudy',
            locale: 'en',
            slug: 'nortide-media',
            title: 'Nortide Media',
            fields: {
                customer: 'Nortide Media',
                industry: 'media',
                summary:
                    "Nortide Media publishes 50+ articles per day across three languages. Astromech's bilingual content model and edge delivery cut their CDN costs in half.",
                content: [
                    {
                        _id: bid(),
                        _type: 'richText',
                        body: doc(
                            para(
                                text(
                                    'Nortide Media is a digital news publisher with bureaux in Oslo, London, and New York. At 50+ articles per day across Norwegian, English, and Spanish, their previous CMS — a custom Drupal installation — struggled with translation latency and editor conflicts.'
                                )
                            ),
                            para(
                                text(
                                    "Astromech's symmetric locale model gave every journalist their own locale-scoped workspace. Articles publish independently per locale. The SEO plugin auto-generates hreflang alternates and a unified sitemap, which Google now crawls without manual submission."
                                )
                            )
                        ),
                    },
                    {
                        _id: bid(),
                        _type: 'stats',
                        items: [
                            { value: '50+', label: 'Articles per day' },
                            { value: '3', label: 'Languages' },
                            { value: '50%', label: 'CDN cost reduction' },
                        ],
                    },
                ],
                metrics: [
                    { value: '50+', label: 'Daily articles published' },
                    { value: '50%', label: 'CDN cost reduction' },
                    { value: '3', label: 'Supported languages' },
                ],
                quote: {
                    text: "Our journalists stopped thinking about CMS mechanics and started thinking about stories. That's the best outcome we could have hoped for.",
                    author: 'Ingrid Larsen',
                    role: 'Head of Digital, Nortide Media',
                },
                related_posts: [post3Id, post6Id],
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ] as Record<string, unknown>[]);

    console.log('  Created 3 case studies\n');

    // A translation is another locale of the same entry, so it reuses the
    // entry's id and only its content row is new.
    await insertEntries([
        {
            id: pageHomeId,
            type: 'page',
            locale: 'fr',
            slug: 'accueil',
            title: 'Accueil',
            fields: {
                content: [
                    {
                        _id: bid(),
                        _type: 'hero',
                        heading: 'Le CMS conçu pour le web moderne',
                        subheading:
                            "Astromech tourne sur Cloudflare Workers, stocke le contenu dans D1, et livre un panneau d'administration sans JavaScript — pour que vous puissiez vous concentrer sur votre produit.",
                        cta: {
                            url: '/features',
                            label: 'Voir les fonctionnalités',
                            target: '_self',
                        },
                    },
                    {
                        _id: bid(),
                        _type: 'featureGrid',
                        heading: "Tout ce qu'il vous faut. Rien de superflu.",
                        features: [
                            {
                                title: 'Natif à la périphérie',
                                description:
                                    'Tourne directement sur Cloudflare Workers — aucun démarrage à froid, temps de réponse inférieurs à la milliseconde depuis 300+ villes.',
                                icon: 'Zap',
                            },
                            {
                                title: 'Contenu type-safe',
                                description:
                                    'Votre schéma vit en TypeScript. Le SDK génère automatiquement des clients entièrement typés depuis votre config.',
                                icon: 'Code2',
                            },
                            {
                                title: 'Bilingue nativement',
                                description:
                                    'Support des locales de première classe avec un modèle de locale symétrique. Aucun plugin, aucun hack — juste une API propre.',
                                icon: 'Globe',
                            },
                        ],
                    },
                    {
                        _id: bid(),
                        _type: 'testimonial',
                        quote: "Astromech a remplacé trois outils distincts pour nous. On publie des mises à jour de contenu plus vite que jamais, et nos éditeurs adorent l'interface épurée.",
                        author: 'Sara Chen',
                        role: 'CTO, Lumenflow',
                    },
                    {
                        _id: bid(),
                        _type: 'cta',
                        heading: 'Prêt à simplifier votre stack ?',
                        text: 'Astromech est open source. Donnez-nous une étoile sur GitHub ou démarrez en moins de cinq minutes.',
                        button: {
                            url: '/pricing',
                            label: 'Commencer gratuitement',
                            target: '_self',
                        },
                    },
                ],
                noindex: false,
                themeColor: '#6d28d9',
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: post1Id,
            type: 'post',
            locale: 'fr',
            slug: 'pourquoi-nous-avons-choisi-cloudflare-workers',
            title: 'Pourquoi nous avons choisi Cloudflare Workers pour Astromech',
            fields: {
                body: doc(
                    para(
                        text(
                            "Lors de la conception du modèle de déploiement d'Astromech, nous avions trois options : un VPS traditionnel, une plateforme de fonctions serverless comme Lambda ou Vercel, ou Cloudflare Workers. Nous avons choisi Cloudflare Workers — et ce choix a façonné chaque décision architecturale depuis."
                        )
                    ),
                    heading(2, text('Aucun démarrage à froid')),
                    para(
                        text(
                            "Lambda et les fonctions Vercel démarrent un processus Node.js à chaque requête après une période d'inactivité. Pour un panneau d'administration CMS, cela signifie que le premier chargement de page après le déjeuner peut prendre deux ou trois secondes. Workers utilisent des isolates V8 : aucun démarrage de processus, aucune résolution de modules au démarrage. Chaque requête touche un runtime chaud."
                        )
                    ),
                    heading(2, text('Global par défaut')),
                    para(
                        text(
                            'Workers se déploient dans 300+ villes simultanément. Astromech interroge D1 — le service SQLite de Cloudflare — qui réplique les lectures globalement. Le résultat est une latence de requête inférieure à la milliseconde presque partout sur terre.'
                        )
                    )
                ),
                excerpt:
                    'Les raisons techniques et économiques derrière notre décision de construire Astromech sur Cloudflare Workers et D1.',
                publishedDate: '2025-11-10',
                category: catEngineeringId,
                tags: [tagCloudflareId, tagEdgeId],
                author: authorTomId,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ] as Record<string, unknown>[]);

    console.log('  Created 2 French translations (home page + 1 post)\n');

    // Globals go through the service so field validation, shared-field
    // propagation and the version snapshot run exactly as they do in the admin.
    // `logo` and `copyright` are `translatable: false`, so writing them on the
    // default content locale propagates them to every other locale's row.
    const app = await createAstromech({ config: { ...config, db: dbDriver } });

    await app.globals.update({
        key: 'site',
        locale: 'en',
        data: {
            fields: {
                siteName: 'Astromech',
                tagline: 'The CMS built for the modern web',
                footerText:
                    'Astromech is an open-source headless CMS designed for Astro + Cloudflare. Fast, type-safe, and developer-first.',
                copyright: '© 2026 Astromech. All rights reserved.',
                logo: null,
                socials: [
                    { platform: 'GitHub', url: 'https://github.com/astromech' },
                    { platform: 'Twitter / X', url: 'https://twitter.com/astromechcms' },
                ],
            },
        },
    });

    await app.globals.update({
        key: 'site',
        locale: 'fr',
        data: {
            fields: {
                siteName: 'Astromech',
                tagline: 'Le CMS conçu pour le web moderne',
                footerText:
                    'Astromech est un CMS headless open source conçu pour Astro + Cloudflare. Rapide, type-safe et orienté développeur.',
                socials: [
                    { platform: 'GitHub', url: 'https://github.com/astromech' },
                    { platform: 'Twitter / X', url: 'https://twitter.com/astromechcms' },
                ],
            },
        },
    });

    await app.globals.publish({ key: 'site', locale: 'en' });
    await app.globals.publish({ key: 'site', locale: 'fr' });
    console.log('  Wrote the `site` global (en + fr, published)\n');

    // Menus globals, one per configured menu at `menus/menu-<key>`. `items` is
    // translatable, so each locale carries its own tree.
    const mainMenuEn = [
        { _id: bid(), label: 'Home', url: '/' },
        { _id: bid(), label: 'Features', url: '/features' },
        { _id: bid(), label: 'Pricing', url: '/pricing' },
        { _id: bid(), label: 'Blog', url: '/blog' },
        { _id: bid(), label: 'Customers', url: '/customers' },
        { _id: bid(), label: 'About', url: '/about' },
    ];

    const mainMenuFr = [
        { _id: bid(), label: 'Accueil', url: '/fr' },
        { _id: bid(), label: 'Fonctionnalités', url: '/fr/features' },
        { _id: bid(), label: 'Tarifs', url: '/fr/pricing' },
        { _id: bid(), label: 'Blog', url: '/fr/blog' },
        { _id: bid(), label: 'Clients', url: '/fr/customers' },
        { _id: bid(), label: 'À propos', url: '/fr/about' },
    ];

    const footerMenuEn = [
        { _id: bid(), label: 'Blog', url: '/blog' },
        { _id: bid(), label: 'Customers', url: '/customers' },
        { _id: bid(), label: 'About', url: '/about' },
        {
            _id: bid(),
            label: 'GitHub',
            url: 'https://github.com/astromech',
            newTab: true,
        },
    ];

    const footerMenuFr = [
        { _id: bid(), label: 'Blog', url: '/fr/blog' },
        { _id: bid(), label: 'Clients', url: '/fr/customers' },
        { _id: bid(), label: 'À propos', url: '/fr/about' },
        {
            _id: bid(),
            label: 'GitHub',
            url: 'https://github.com/astromech',
            newTab: true,
        },
    ];

    const menuTrees: [string, string, JsonObject[]][] = [
        ['menus/menu-main', 'en', mainMenuEn],
        ['menus/menu-main', 'fr', mainMenuFr],
        ['menus/menu-footer', 'en', footerMenuEn],
        ['menus/menu-footer', 'fr', footerMenuFr],
    ];

    for (const [key, locale, items] of menuTrees) {
        await app.globals.update({ key, locale, data: { fields: { items } } });
        await app.globals.publish({ key, locale });
    }
    console.log('  Wrote the menus globals (main + footer, en + fr, published)\n');

    // The redirects table is the plugin's own, so its rows go through the
    // plugin's own table codec rather than being hand-built: `encodeWith` mints
    // the ULID id and the ISO-TEXT createdAt/updatedAt from the table's
    // defaults, exactly as `tableRepository` does at runtime.
    await pluginDb
        .insertInto('pluginRedirectsRedirects')
        .values(
            [
                { from: '/old-home', to: '/', status: '301', enabled: true },
                {
                    from: '/blog/old-post',
                    to: '/blog/getting-started-with-astromech',
                    status: '301',
                    enabled: true,
                },
                {
                    from: '/customers/index',
                    to: '/customers',
                    status: '302',
                    enabled: true,
                },
            ].map((row) => encodeWith(redirectsTable, row))
        )
        .execute();
    console.log('  Created 3 redirects\n');

    /**
     * One published contact form. `forms/form` uses core (default) entry
     * repository, so it's seeded like any other entry — see
     * packages/plugins/forms/src/entries/form.ts for the block config keys.
     */
    const formContactId = crypto.randomUUID();

    await insertEntries([
        {
            id: formContactId,
            type: 'forms/form',
            locale: 'en',
            slug: 'contact',
            title: 'Contact',
            fields: {
                enabled: true,
                fields: [
                    {
                        _id: bid(),
                        _type: 'text',
                        name: 'name',
                        label: 'Your name',
                        required: true,
                    },
                    {
                        _id: bid(),
                        _type: 'email',
                        name: 'email',
                        label: 'Email address',
                        required: true,
                    },
                    {
                        _id: bid(),
                        _type: 'select',
                        name: 'topic',
                        label: 'Topic',
                        options: [
                            { label: 'General', value: 'general' },
                            { label: 'Support', value: 'support' },
                            { label: 'Sales', value: 'sales' },
                        ],
                    },
                    {
                        _id: bid(),
                        _type: 'textarea',
                        name: 'message',
                        label: 'Message',
                        required: true,
                    },
                    {
                        _id: bid(),
                        _type: 'checkbox',
                        name: 'consent',
                        label: 'I agree to be contacted',
                    },
                ],
                notifications: [
                    {
                        _id: bid(),
                        _type: 'email',
                        to: 'ops@astromech.dev',
                        subject: 'New enquiry from {{name}}',
                        // body left unset — exercises the documented
                        // default (a table of the submitted answers).
                    },
                    {
                        _id: bid(),
                        _type: 'email',
                        to: '{{email}}',
                        subject: 'Thanks for getting in touch — {{formTitle}}',
                        // body left unset — exercises the documented
                        // default (just the values table, sent straight
                        // back to the submitter).
                    },
                ],
                // No spam provider is configured in the demo (see
                // astromech.config.ts), so the gate is left off explicitly
                // rather than relying on it being skipped.
                spamProtection: false,
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ] as Record<string, unknown>[]);
    console.log('  Created 1 form (contact)\n');

    // Runs last so every entry it reads has been seeded.
    await indexRelationships();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Seed complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(
        '  Media          9  (placeholder photos downloaded to demo/public/uploads/)'
    );
    console.log('  Categories     4  (engineering, product, community, tutorials)');
    console.log(
        '  Tags           5  (astro, cloudflare, typescript, headless-cms, edge)'
    );
    console.log('  Authors        3  (Alex Morgan, Priya Sharma, Tom Rivers)');
    console.log(
        '  Pages          4  (home, features, pricing, about) + 1 FR translation'
    );
    console.log('  Posts          6  (all published, en) + 1 FR translation');
    console.log('  Case studies   3  (lumenflow, pixel-agency, nortide-media)');
    console.log('  Globals        1  (site, en + fr)');
    console.log('  Menus          2  globals (main + footer, en + fr each)');
    console.log('  Redirects      3');
    console.log('  Forms          1  (contact)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Admin login: admin@astromech.dev / password');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

seed().catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
