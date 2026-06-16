/**
 * Demo marketing-site seed — Phase 27f
 *
 * Clears all content entries (page / post / author / caseStudy / category / tag)
 * plus relationships, redirects, and settings on every run. Preserves auth rows
 * (users + accounts) — creates admin@astromech.dev / password if missing.
 *
 * Run from the repo root:
 *   npm run db:seed:demo
 * or directly:
 *   tsx demo/seed.ts
 */

import { drizzle } from 'drizzle-orm/libsql';
import { eq, inArray, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharpLib from 'sharp';
import * as schema from '../src/db/schema.js';
import { redirectsTable } from '../src/plugins/redirects/schema/redirects.js';
import { readImageDimensions } from '../src/images/dimensions.js';
import { contentVersion } from '../src/images/version.js';
import { sharp } from '../src/images/drivers/sharp.js';

const DB_PATH = new URL('./database.db', import.meta.url).pathname;

const db = drizzle({
    connection: { url: `file:${DB_PATH}` },
});

const now = new Date();
const PUBLISHED_AT = now;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertAdmin(): Promise<string> {
    const email = 'admin@astromech.dev';
    const existing = await db
        .select({ id: schema.usersTable.id })
        .from(schema.usersTable)
        .where(eq(schema.usersTable.email, email));

    if (existing.length > 0 && existing[0] !== undefined) {
        console.log(`  Admin user exists: ${email}`);
        return existing[0].id;
    }

    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const hashedPassword = await hashPassword('password');

    await db.insert(schema.usersTable).values({
        id: userId,
        email,
        name: 'Alex Admin',
        emailVerified: true,
        roleSlug: 'admin',
        createdAt: now,
        updatedAt: now,
    });

    await db.insert(schema.accountsTable).values({
        id: accountId,
        accountId: userId,
        providerId: 'credential',
        userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
    });

    console.log(`  Created admin user: ${email}`);
    return userId;
}

type RelInput = {
    sourceId: string;
    name: string;
    targetId: string;
    targetType: 'entry' | 'user' | 'media';
    position: number;
};

async function insertRels(rows: RelInput[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(schema.relationshipsTable).values(
        rows.map((r) => ({
            id: crypto.randomUUID(),
            sourceId: r.sourceId,
            sourceType: 'entry' as const,
            name: r.name,
            targetId: r.targetId,
            targetType: r.targetType,
            position: r.position,
            createdAt: now,
        }))
    );
}

async function upsertSetting(key: string, value: unknown): Promise<void> {
    await db
        .insert(schema.settingsTable)
        .values({ key, value: value as schema.SettingRow['value'], updatedAt: now })
        .onConflictDoUpdate({
            target: schema.settingsTable.key,
            set: { value: value as schema.SettingRow['value'], updatedAt: now },
        });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
    console.log('Seeding demo marketing database…\n');

    // -------------------------------------------------------------------------
    // Clear content (keep users / accounts / sessions / roles)
    // -------------------------------------------------------------------------
    const CONTENT_TYPES = ['page', 'post', 'author', 'caseStudy', 'category', 'tag'];

    // Delete relationships whose source is a content entry of these types
    const contentEntryIds = await db
        .select({ id: schema.entriesTable.id })
        .from(schema.entriesTable)
        .where(inArray(schema.entriesTable.type, CONTENT_TYPES));

    const ids = contentEntryIds.map((r) => r.id);
    if (ids.length > 0) {
        await db
            .delete(schema.relationshipsTable)
            .where(inArray(schema.relationshipsTable.sourceId, ids));
    }

    // Delete old content entries (any type in the list + legacy types)
    await db
        .delete(schema.entriesTable)
        .where(inArray(schema.entriesTable.type, [...CONTENT_TYPES, 'showcase']));

    // Clear settings and redirects
    await db.delete(schema.settingsTable).where(sql`1=1`);
    await db.delete(redirectsTable).where(sql`1=1`);

    // Clear leftover media rows (no files on disk referenced)
    await db.delete(schema.mediaTable).where(sql`1=1`);

    console.log('  Cleared content entries, relationships, settings, redirects, media\n');

    // -------------------------------------------------------------------------
    // Admin user
    // -------------------------------------------------------------------------
    const adminId = await upsertAdmin();
    console.log();

    // -------------------------------------------------------------------------
    // Media — real JPEG bytes generated via sharp (no network), written to
    // demo/public/uploads/<id>.jpg so /_media/<id>.jpg can serve them.
    // -------------------------------------------------------------------------

    type Bg = { r: number; g: number; b: number };

    async function seedMedia(
        id: string,
        filename: string,
        width: number,
        height: number,
        bg: Bg,
        alt: string,
        fields: Record<string, unknown>
    ): Promise<schema.NewMediaRow> {
        const buf = await sharpLib({
            create: { width, height, channels: 3, background: bg },
        })
            .jpeg({ quality: 80 })
            .toBuffer();

        const bytes = new Uint8Array(buf);

        const uploadsDir = new URL('./public/uploads/', import.meta.url);
        await mkdir(uploadsDir, { recursive: true });
        await writeFile(new URL(`${id}.jpg`, uploadsDir), buf);

        const dims = readImageDimensions(bytes);
        const version = await contentVersion(bytes);
        const driver = sharp();
        const blurhash = await driver.placeholder(bytes);

        return {
            id,
            filename,
            mimeType: 'image/jpeg',
            size: buf.length,
            width: dims?.width ?? width,
            height: dims?.height ?? height,
            alt,
            fields,
            metadata: { version, blurhash },
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        };
    }

    const mediaHeroId = crypto.randomUUID();
    const mediaDashboardId = crypto.randomUUID();
    const mediaTeamId = crypto.randomUUID();

    const mediaRows = await Promise.all([
        seedMedia(
            mediaHeroId,
            'astromech-hero.jpg',
            1920,
            1080,
            { r: 109, g: 40, b: 217 },
            'Astromech CMS hero',
            { alt_text: 'Astromech CMS hero image', copyright: '© 2026 Astromech' }
        ),
        seedMedia(
            mediaDashboardId,
            'astromech-dashboard.jpg',
            1280,
            800,
            { r: 37, g: 99, b: 235 },
            'Astromech admin dashboard',
            {
                alt_text: 'Astromech admin dashboard screenshot',
                copyright: '© 2026 Astromech',
            }
        ),
        seedMedia(
            mediaTeamId,
            'astromech-team.jpg',
            800,
            600,
            { r: 13, g: 148, b: 136 },
            'Astromech team',
            { alt_text: 'The Astromech team', copyright: '© 2026 Astromech' }
        ),
    ]);

    await db.insert(schema.mediaTable).values(mediaRows);
    console.log('  Created 3 media items\n');

    // -------------------------------------------------------------------------
    // Categories
    // -------------------------------------------------------------------------
    const catEngineeringId = crypto.randomUUID();
    const catProductId = crypto.randomUUID();
    const catCommunityId = crypto.randomUUID();
    const catTutorialsId = crypto.randomUUID();
    const catEngineeringGroup = crypto.randomUUID();
    const catProductGroup = crypto.randomUUID();
    const catCommunityGroup = crypto.randomUUID();
    const catTutorialsGroup = crypto.randomUUID();

    await db.insert(schema.entriesTable).values([
        {
            id: catEngineeringId,
            type: 'category',
            locale: 'en',
            localeGroup: catEngineeringGroup,
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
            localeGroup: catProductGroup,
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
            localeGroup: catCommunityGroup,
            slug: 'community',
            title: 'Community',
            fields: { description: 'Stories from teams building with Astromech.' },
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
            localeGroup: catTutorialsGroup,
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
    ]);
    console.log('  Created 4 categories\n');

    // -------------------------------------------------------------------------
    // Tags
    // -------------------------------------------------------------------------
    const tagAstroId = crypto.randomUUID();
    const tagCloudflareId = crypto.randomUUID();
    const tagTypescriptId = crypto.randomUUID();
    const tagHeadlessCmsId = crypto.randomUUID();
    const tagEdgeId = crypto.randomUUID();

    await db.insert(schema.entriesTable).values([
        {
            id: tagAstroId,
            type: 'tag',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
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
            localeGroup: crypto.randomUUID(),
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
            localeGroup: crypto.randomUUID(),
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
            localeGroup: crypto.randomUUID(),
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
            localeGroup: crypto.randomUUID(),
            slug: 'edge',
            title: 'Edge',
            fields: { color: '#f59e0b' },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);
    console.log('  Created 5 tags\n');

    // -------------------------------------------------------------------------
    // Authors (3) — title column holds the author name
    // -------------------------------------------------------------------------
    const authorAlexId = crypto.randomUUID();
    const authorPriyaId = crypto.randomUUID();
    const authorTomId = crypto.randomUUID();
    const authorAlexGroup = crypto.randomUUID();
    const authorPriyaGroup = crypto.randomUUID();
    const authorTomGroup = crypto.randomUUID();

    await db.insert(schema.entriesTable).values([
        {
            id: authorAlexId,
            type: 'author',
            locale: 'en',
            localeGroup: authorAlexGroup,
            slug: 'alex-morgan',
            title: 'Alex Morgan',
            fields: {
                bio: '<p>Alex is the founder of Astromech and a long-time contributor to the Astro ecosystem. Passionate about developer experience and edge computing.</p>',
                role: 'Founder & CEO',
                socials: [
                    { platform: 'twitter', url: 'https://twitter.com/astromechcms' },
                    { platform: 'github', url: 'https://github.com/astromech' },
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
            localeGroup: authorPriyaGroup,
            slug: 'priya-sharma',
            title: 'Priya Sharma',
            fields: {
                bio: '<p>Priya leads product at Astromech. Former Contentful engineer with a deep interest in content modelling and workflow design.</p>',
                role: 'Head of Product',
                socials: [
                    { platform: 'linkedin', url: 'https://linkedin.com/in/priyasharma' },
                    { platform: 'twitter', url: 'https://twitter.com/priya_builds' },
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
            localeGroup: authorTomGroup,
            slug: 'tom-rivers',
            title: 'Tom Rivers',
            fields: {
                bio: '<p>Tom is a senior engineer at Astromech, focused on the Cloudflare Workers runtime and D1 storage layer. Open source contributor and database enthusiast.</p>',
                role: 'Senior Engineer',
                socials: [
                    { platform: 'github', url: 'https://github.com/tomrivers' },
                    { platform: 'website', url: 'https://tomrivers.dev' },
                ],
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);
    console.log('  Created 3 authors\n');

    // -------------------------------------------------------------------------
    // Pages (home, features, pricing, about) with blocks
    // -------------------------------------------------------------------------
    const pageHomeId = crypto.randomUUID();
    const pageFeaturesId = crypto.randomUUID();
    const pagePricingId = crypto.randomUUID();
    const pageAboutId = crypto.randomUUID();
    const pageHomeGroup = crypto.randomUUID();
    const pageFeaturesGroup = crypto.randomUUID();
    const pagePricingGroup = crypto.randomUUID();
    const pageAboutGroup = crypto.randomUUID();

    // Block _id helper
    const bid = () => crypto.randomUUID();

    await db.insert(schema.entriesTable).values([
        // ---- home ----
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
                        _id: bid(),
                        _type: 'hero',
                        heading: 'The CMS built for the modern web',
                        subheading:
                            'Astromech runs on Cloudflare Workers, stores content in D1, and ships a zero-JS admin panel — so you can focus on shipping your product.',
                        cta: {
                            href: '/features',
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
                            href: '/pricing',
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

        // ---- features ----
        {
            id: pageFeaturesId,
            type: 'page',
            locale: 'en',
            localeGroup: pageFeaturesGroup,
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
                        cta: { href: '/pricing', label: 'Start free', target: '_self' },
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
                        left: '<h3>Admin panel</h3><p>A fast, keyboard-navigable admin built with TanStack Router and React. Command palette, live search, and a plugin-aware sidebar — shipped as a single JavaScript bundle alongside your Worker.</p>',
                        right: '<h3>Server SDK</h3><p>Import <code>astromech/local</code> in your Astro pages and query content directly — no HTTP round-trips. Every method is typed from your schema. No code generation step, no build-time magic.</p>',
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

        // ---- pricing ----
        {
            id: pagePricingId,
            type: 'page',
            locale: 'en',
            localeGroup: pagePricingGroup,
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
                            href: 'https://github.com/astromech',
                            label: 'View on GitHub',
                            target: '_blank',
                        },
                    },
                    {
                        _id: bid(),
                        _type: 'richText',
                        body: "<h2>Self-hosted (free)</h2><p>Clone the repo, configure your Cloudflare account, and deploy. You pay only Cloudflare's usage costs — typically a few dollars per month for a busy site.</p><h2>Managed (coming soon)</h2><p>We handle deployments, migrations, backups, and monitoring. Pricing will be usage-based with a generous free tier. Join the waitlist to be first to know.</p>",
                    },
                    {
                        _id: bid(),
                        _type: 'cta',
                        heading: 'Get started today',
                        text: 'Read the docs and have your first Astromech project running in under five minutes.',
                        button: {
                            href: 'https://docs.astromech.dev',
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

        // ---- about ----
        {
            id: pageAboutId,
            type: 'page',
            locale: 'en',
            localeGroup: pageAboutGroup,
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
                        body: '<h2>Our story</h2><p>Astromech started as an internal tool for a small web agency. We kept reaching for the same patterns — a headless CMS that understood TypeScript, deployed to the edge, and didn\'t charge per seat. Nothing fit. So we built it.</p><p>We open-sourced Astromech in 2025 and have been growing ever since. Today hundreds of projects use Astromech in production, from personal blogs to large editorial teams at media companies.</p><h2>Our values</h2><ul><li><strong>Developer experience first</strong> — every API decision is made by asking "what would a developer want this to feel like?"</li><li><strong>No lock-in</strong> — your content schema is code you own. Export it, migrate it, self-host it.</li><li><strong>Performance by default</strong> — the edge is not optional. Slow CMSes make slow sites.</li></ul>',
                    },
                    {
                        _id: bid(),
                        _type: 'cta',
                        heading: 'Come build with us',
                        text: 'Astromech is open source and we welcome contributions of all sizes.',
                        button: {
                            href: 'https://github.com/astromech/astromech',
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
    ]);
    console.log('  Created 4 pages (home, features, pricing, about)\n');

    // -------------------------------------------------------------------------
    // Posts (6 en)
    // -------------------------------------------------------------------------
    const post1Id = crypto.randomUUID();
    const post2Id = crypto.randomUUID();
    const post3Id = crypto.randomUUID();
    const post4Id = crypto.randomUUID();
    const post5Id = crypto.randomUUID();
    const post6Id = crypto.randomUUID();

    const post1Group = crypto.randomUUID();
    const post2Group = crypto.randomUUID();

    await db.insert(schema.entriesTable).values([
        {
            id: post1Id,
            type: 'post',
            locale: 'en',
            localeGroup: post1Group,
            slug: 'why-we-chose-cloudflare-workers',
            title: 'Why We Chose Cloudflare Workers for Astromech',
            fields: {
                body: "<p>When we started designing Astromech's deployment model, we had three options: a traditional VPS, a serverless function platform like Lambda or Vercel, or Cloudflare Workers. We chose Cloudflare Workers — and it has shaped every architectural decision since.</p><h2>No cold starts</h2><p>Lambda and Vercel Functions boot a Node.js process on each request after a period of inactivity. For a CMS admin panel, this means the first page load after lunch can take two or three seconds. Workers run on V8 isolates: no process boot, no module resolution at startup. Every request hits a warm runtime.</p><h2>Global by default</h2><p>Workers deploy to 300+ cities simultaneously. Astromech queries D1 — Cloudflare's SQLite service — which replicates reads globally. The result is sub-millisecond query latency almost anywhere on earth.</p><h2>The cost model</h2><p>Workers pricing is request-based with a generous free tier (100,000 requests/day). For most Astromech installations, the monthly bill is below $5. Compare that to a $20/month VPS sitting idle 90% of the time.</p>",
                excerpt:
                    'The technical and economic reasons behind our decision to build Astromech on Cloudflare Workers and D1.',
                publishedDate: '2025-11-10',
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
            localeGroup: post2Group,
            slug: 'building-a-blocks-system-in-typescript',
            title: 'Building a Type-Safe Blocks System in TypeScript',
            fields: {
                body: "<p>Page builders are notoriously hard to make type-safe. A block can be one of many shapes, the list of block types is user-defined, and both the admin UI and the front-end renderer need to agree on the shape of each block at compile time.</p><p>In Astromech, the blocks field is defined in your config:</p><pre><code>fields.blocks('content', { blocks: blockCatalog })</code></pre><p>Each block in the catalog is a <code>block(type, { fields: [...] })</code> call. The type parameter is a string literal; the fields array determines the shape. At build time, Astromech generates a discriminated union from the catalog so your Astro components get fully typed props. Each stored block carries reserved, underscore-prefixed keys (<code>_type</code>, <code>_id</code>, optional <code>_disabled</code>) so they never collide with your own field names:</p><pre><code>type ContentBlock =\n  | { _type: 'hero'; heading: string; subheading?: string; cta?: Link }\n  | { _type: 'richText'; body: string }\n  | { _type: 'featureGrid'; heading?: string; features: Feature[] }\n  // ...</code></pre><p>The Blocks dispatcher component switches on <code>block._type</code> and TypeScript narrows to the correct shape in each branch — no type assertions required.</p>",
                excerpt:
                    'How Astromech implements a fully type-safe blocks system from schema definition to front-end rendering.',
                publishedDate: '2025-12-03',
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
            localeGroup: crypto.randomUUID(),
            slug: 'symmetric-locale-model-explained',
            title: 'The Symmetric Locale Model: i18n Without the Complexity',
            fields: {
                body: '<p>Most headless CMSes bolt i18n on after the fact. The result is an asymmetric model where one locale is "primary" and others are "translations of" that primary — a hierarchy that breaks down the moment you want to create a locale variant that diverges significantly from the source.</p><p>Astromech uses a symmetric locale model: every locale entry is a peer. They are linked by a <code>localeGroup</code> UUID that identifies the content they represent, but no locale is more canonical than another. You can create a French entry first and add the English one later. You can have Spanish without English.</p><h2>The API</h2><p>When you query entries, you pass a <code>locale</code> option and get back only entries for that locale. The <code>entry.locales</code> field lists all locales that have an entry in the same locale group — useful for rendering <code>&lt;hreflang&gt;</code> alternates.</p><p>Creating a translation is <code>entries.create({ type, locale: \'fr\', localeGroup: enEntry.localeGroup, ... })</code>. One line. No special "translate" method, no source/target semantics.</p>',
                excerpt:
                    'How the symmetric locale model in Astromech lets you add i18n without giving up flexibility.',
                publishedDate: '2026-01-15',
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
            localeGroup: crypto.randomUUID(),
            slug: 'plugin-architecture-deep-dive',
            title: 'Astromech Plugin Architecture: A Deep Dive',
            fields: {
                body: '<p>Astromech ships two first-party plugins — SEO and Redirects — and the plugin API is entirely public. This post walks through how plugins work, what they can extend, and how to write one from scratch.</p><h2>What a plugin can do</h2><ul><li><strong>Schema</strong>: add Drizzle tables that migrate alongside core tables.</li><li><strong>Entry types</strong>: register custom entry types with their own storage (including custom SQLite tables).</li><li><strong>Admin pages</strong>: add sidebar entries and settings forms to the admin panel.</li><li><strong>Hooks</strong>: subscribe to <code>entry:beforeCreate</code>, <code>entry:afterUpdate</code>, and more.</li><li><strong>SDK methods</strong>: expose typed methods on the <code>Astromech.plugins.yourPlugin</code> namespace.</li></ul><h2>Plugin identity</h2><p>A plugin declares a <code>package</code> name (its npm package name). Astromech derives the permission namespace, table prefix, and schema module path from this single string — no manual configuration.</p><p>The result is a plugin system where first-party and third-party plugins are indistinguishable to the host application.</p>',
                excerpt:
                    'A complete walkthrough of the Astromech plugin system — what plugins can extend, and how to write one.',
                publishedDate: '2026-02-20',
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
            localeGroup: crypto.randomUUID(),
            slug: 'getting-started-with-astromech',
            title: 'Getting Started with Astromech in 5 Minutes',
            fields: {
                body: "<p>This tutorial walks you from zero to a working Astromech installation in under five minutes. You'll need Node.js 20+, an Astro project, and a Cloudflare account (or skip that for local-only development).</p><h2>Install</h2><pre><code>npm install astromech</code></pre><h2>Configure</h2><p>Create <code>astromech.config.ts</code> in your project root:</p><pre><code>import { defineConfig, libsqlDriver } from 'astromech';\nimport * as fields from 'astromech/fields';\n\nexport default defineConfig({\n  db: libsqlDriver({ url: 'file:./database.db' }),\n  entries: {\n    post: {\n      single: 'Post',\n      plural: 'Posts',\n      fields: [\n        fields.richtext('body', { required: true }),\n        fields.textarea('excerpt'),\n      ],\n    },\n  },\n});\n</code></pre><h2>Initialise the DB</h2><pre><code>npx astromech db:init\nnpx astromech users:create --email you@example.com --password secret</code></pre><h2>Query content</h2><p>In your Astro page:</p><pre><code>import Astromech from 'astromech/local';\nconst { data: posts } = await Astromech.entries.query({ type: 'post', locale: 'en' });\n</code></pre><p>That's it. Your CMS is running.</p>",
                excerpt:
                    'Install, configure, and query your first Astromech content in under five minutes.',
                publishedDate: '2026-03-01',
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
            localeGroup: crypto.randomUUID(),
            slug: 'seo-plugin-walkthrough',
            title: 'The SEO Plugin: Meta Tags, Sitemaps, and hreflang',
            fields: {
                body: "<p>Search engine optimisation in a headless CMS requires careful attention to meta tags, canonical URLs, and locale alternates. The Astromech SEO plugin handles all three — and is designed to compose cleanly with the blocks system and the symmetric locale model.</p><h2>The seoSection field group</h2><p>Add <code>seoSection()</code> to any entry type's fields to get a collapsible group with title, description, canonical URL override, and robots fields. All per-locale, all editable in the admin without code.</p><h2>Reading SEO data</h2><p>Call <code>Astromech.plugins.seo.meta({ entry, locale })</code> to get a resolved object with title, description, og:title, og:description, and canonical. Pass it to your <code>&lt;Seo&gt;</code> component.</p><h2>Sitemap</h2><p><code>Astromech.plugins.seo.sitemap()</code> returns all published entries with their URLs and locale alternates formatted for a <code>sitemap.xml</code> response. Add a single Astro route and you're done.</p>",
                excerpt:
                    'How the Astromech SEO plugin provides meta tags, sitemap generation, and hreflang support out of the box.',
                publishedDate: '2026-03-15',
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);

    await insertRels([
        // post1 — Cloudflare Workers
        {
            sourceId: post1Id,
            name: 'category',
            targetId: catEngineeringId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post1Id,
            name: 'tags',
            targetId: tagCloudflareId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post1Id,
            name: 'tags',
            targetId: tagEdgeId,
            targetType: 'entry',
            position: 1,
        },
        {
            sourceId: post1Id,
            name: 'author',
            targetId: authorTomId,
            targetType: 'entry',
            position: 0,
        },

        // post2 — blocks system
        {
            sourceId: post2Id,
            name: 'category',
            targetId: catEngineeringId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post2Id,
            name: 'tags',
            targetId: tagTypescriptId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post2Id,
            name: 'tags',
            targetId: tagAstroId,
            targetType: 'entry',
            position: 1,
        },
        {
            sourceId: post2Id,
            name: 'author',
            targetId: authorAlexId,
            targetType: 'entry',
            position: 0,
        },

        // post3 — locale model
        {
            sourceId: post3Id,
            name: 'category',
            targetId: catProductId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post3Id,
            name: 'tags',
            targetId: tagHeadlessCmsId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post3Id,
            name: 'author',
            targetId: authorPriyaId,
            targetType: 'entry',
            position: 0,
        },

        // post4 — plugin architecture
        {
            sourceId: post4Id,
            name: 'category',
            targetId: catEngineeringId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post4Id,
            name: 'tags',
            targetId: tagTypescriptId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post4Id,
            name: 'tags',
            targetId: tagHeadlessCmsId,
            targetType: 'entry',
            position: 1,
        },
        {
            sourceId: post4Id,
            name: 'author',
            targetId: authorAlexId,
            targetType: 'entry',
            position: 0,
        },

        // post5 — getting started
        {
            sourceId: post5Id,
            name: 'category',
            targetId: catTutorialsId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post5Id,
            name: 'tags',
            targetId: tagAstroId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post5Id,
            name: 'tags',
            targetId: tagCloudflareId,
            targetType: 'entry',
            position: 1,
        },
        {
            sourceId: post5Id,
            name: 'author',
            targetId: authorTomId,
            targetType: 'entry',
            position: 0,
        },

        // post6 — SEO plugin
        {
            sourceId: post6Id,
            name: 'category',
            targetId: catTutorialsId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post6Id,
            name: 'tags',
            targetId: tagHeadlessCmsId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post6Id,
            name: 'tags',
            targetId: tagAstroId,
            targetType: 'entry',
            position: 1,
        },
        {
            sourceId: post6Id,
            name: 'author',
            targetId: authorPriyaId,
            targetType: 'entry',
            position: 0,
        },
    ]);
    console.log('  Created 6 posts (en)\n');

    // -------------------------------------------------------------------------
    // Case Studies (3)
    // -------------------------------------------------------------------------
    const cs1Id = crypto.randomUUID();
    const cs2Id = crypto.randomUUID();
    const cs3Id = crypto.randomUUID();

    await db.insert(schema.entriesTable).values([
        {
            id: cs1Id,
            type: 'caseStudy',
            locale: 'en',
            localeGroup: crypto.randomUUID(),
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
                        body: '<p>Lumenflow is a B2B SaaS company with editorial teams in four countries. Their previous setup — a WordPress multisite with custom plugins — required a dedicated DevOps engineer just to keep running. Translation workflows lived in spreadsheets. Publishing required a manual approval email chain.</p><p>After migrating to Astromech, the team ships content updates directly from the admin panel. The symmetric locale model means their French, German, and Japanese editors work in parallel without stepping on each other. Deployment takes seconds, not minutes.</p>',
                    },
                    {
                        _id: bid(),
                        _type: 'stats',
                        items: [
                            { value: '60%', label: 'Reduction in editorial time' },
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
            localeGroup: crypto.randomUUID(),
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
                        body: "<p>Running a CMS at agency scale means one system must serve forty different clients, each with unique content models, brand guidelines, and editorial permissions. Pixel Agency evaluated six headless CMSes before choosing Astromech for its plugin architecture and the ability to deploy isolated instances per client on a single Cloudflare account.</p><p>They built three internal plugins — one for brand asset management, one for approval workflows, and one for a client-facing preview portal. Each plugin hooks into Astromech's admin panel and SDK without forking the core codebase.</p>",
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
            localeGroup: crypto.randomUUID(),
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
                        body: "<p>Nortide Media is a digital news publisher with bureaux in Oslo, London, and New York. At 50+ articles per day across Norwegian, English, and Spanish, their previous CMS — a custom Drupal installation — struggled with translation latency and editor conflicts.</p><p>Astromech's symmetric locale model gave every journalist their own locale-scoped workspace. Articles publish independently per locale. The SEO plugin auto-generates hreflang alternates and a unified sitemap, which Google now crawls without manual submission.</p>",
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
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);

    await insertRels([
        // cs1 related posts
        {
            sourceId: cs1Id,
            name: 'related_posts',
            targetId: post3Id,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: cs1Id,
            name: 'related_posts',
            targetId: post5Id,
            targetType: 'entry',
            position: 1,
        },
        // cs3 related posts
        {
            sourceId: cs3Id,
            name: 'related_posts',
            targetId: post3Id,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: cs3Id,
            name: 'related_posts',
            targetId: post6Id,
            targetType: 'entry',
            position: 1,
        },
    ]);
    console.log('  Created 3 case studies\n');

    // -------------------------------------------------------------------------
    // French translations — home page + 1 post
    // -------------------------------------------------------------------------
    const pageHomeFrId = crypto.randomUUID();
    const post1FrId = crypto.randomUUID();

    await db.insert(schema.entriesTable).values([
        {
            id: pageHomeFrId,
            type: 'page',
            locale: 'fr',
            localeGroup: pageHomeGroup,
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
                            href: '/features',
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
                            href: '/pricing',
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
            id: post1FrId,
            type: 'post',
            locale: 'fr',
            localeGroup: post1Group,
            slug: 'pourquoi-nous-avons-choisi-cloudflare-workers',
            title: 'Pourquoi nous avons choisi Cloudflare Workers pour Astromech',
            fields: {
                body: "<p>Lors de la conception du modèle de déploiement d'Astromech, nous avions trois options : un VPS traditionnel, une plateforme de fonctions serverless comme Lambda ou Vercel, ou Cloudflare Workers. Nous avons choisi Cloudflare Workers — et ce choix a façonné chaque décision architecturale depuis.</p><h2>Aucun démarrage à froid</h2><p>Lambda et les fonctions Vercel démarrent un processus Node.js à chaque requête après une période d'inactivité. Pour un panneau d'administration CMS, cela signifie que le premier chargement de page après le déjeuner peut prendre deux ou trois secondes. Workers utilisent des isolates V8 : aucun démarrage de processus, aucune résolution de modules au démarrage. Chaque requête touche un runtime chaud.</p><h2>Global par défaut</h2><p>Workers se déploient dans 300+ villes simultanément. Astromech interroge D1 — le service SQLite de Cloudflare — qui réplique les lectures globalement. Le résultat est une latence de requête inférieure à la milliseconde presque partout sur terre.</p>",
                excerpt:
                    'Les raisons techniques et économiques derrière notre décision de construire Astromech sur Cloudflare Workers et D1.',
                publishedDate: '2025-11-10',
            },
            status: 'published',
            publishedAt: PUBLISHED_AT,
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);

    await insertRels([
        // post1 FR — same taxonomy as EN (non-translatable fields mirrored)
        {
            sourceId: post1FrId,
            name: 'category',
            targetId: catEngineeringId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post1FrId,
            name: 'tags',
            targetId: tagCloudflareId,
            targetType: 'entry',
            position: 0,
        },
        {
            sourceId: post1FrId,
            name: 'tags',
            targetId: tagEdgeId,
            targetType: 'entry',
            position: 1,
        },
        {
            sourceId: post1FrId,
            name: 'author',
            targetId: authorTomId,
            targetType: 'entry',
            position: 0,
        },
    ]);
    console.log('  Created 2 French translations (home page + 1 post)\n');

    // -------------------------------------------------------------------------
    // Globals settings (translatable)
    //
    // Partition by field translatable flag per settings-page-values.ts:
    //   - Non-translatable fields (logo, copyright, socials.url) → key `globals`
    //   - Translatable fields (siteName, tagline, footerText, mainMenu, footerMenu,
    //     platform labels) → key `globals:en` and `globals:fr`
    //
    // settings.get('globals', { locale: 'en' }) merges `globals` + `globals:en`.
    // -------------------------------------------------------------------------
    const globalsShared = {
        copyright: '© 2026 Astromech. All rights reserved.',
        // logo media field — leave null (no logo media row)
        logo: null,
        // socials.url is non-translatable but platform label is translatable;
        // store the full socials array in the per-locale key to keep them coherent
    };

    const globalsEn = {
        siteName: 'Astromech',
        tagline: 'The CMS built for the modern web',
        footerText:
            'Astromech is an open-source headless CMS designed for Astro + Cloudflare. Fast, type-safe, and developer-first.',
        socials: [
            { platform: 'GitHub', url: 'https://github.com/astromech' },
            { platform: 'Twitter / X', url: 'https://twitter.com/astromechcms' },
        ],
    };

    const globalsFr = {
        siteName: 'Astromech',
        tagline: 'Le CMS conçu pour le web moderne',
        footerText:
            'Astromech est un CMS headless open source conçu pour Astro + Cloudflare. Rapide, type-safe et orienté développeur.',
        socials: [
            { platform: 'GitHub', url: 'https://github.com/astromech' },
            { platform: 'Twitter / X', url: 'https://twitter.com/astromechcms' },
        ],
    };

    await upsertSetting('globals', globalsShared);
    await upsertSetting('globals:en', globalsEn);
    await upsertSetting('globals:fr', globalsFr);
    console.log('  Wrote globals settings (shared + en + fr)\n');

    // -------------------------------------------------------------------------
    // Menus plugin settings (plugin:astromech-menus:/menus/<key>[:<locale>])
    // -------------------------------------------------------------------------

    // Shared base (non-translatable fields — items are translatable so kept per-locale)
    const menusShared = {};

    // Main menu — EN
    const mainMenuEn = {
        items: [
            { _id: bid(), label: 'Home', url: '/' },
            { _id: bid(), label: 'Features', url: '/features' },
            { _id: bid(), label: 'Pricing', url: '/pricing' },
            { _id: bid(), label: 'Blog', url: '/blog' },
            { _id: bid(), label: 'Customers', url: '/customers' },
            { _id: bid(), label: 'About', url: '/about' },
        ],
    };

    // Main menu — FR
    const mainMenuFr = {
        items: [
            { _id: bid(), label: 'Accueil', url: '/fr' },
            { _id: bid(), label: 'Fonctionnalités', url: '/fr/features' },
            { _id: bid(), label: 'Tarifs', url: '/fr/pricing' },
            { _id: bid(), label: 'Blog', url: '/fr/blog' },
            { _id: bid(), label: 'Clients', url: '/fr/customers' },
            { _id: bid(), label: 'À propos', url: '/fr/about' },
        ],
    };

    // Footer menu — EN
    const footerMenuEn = {
        items: [
            { _id: bid(), label: 'Blog', url: '/blog' },
            { _id: bid(), label: 'Customers', url: '/customers' },
            { _id: bid(), label: 'About', url: '/about' },
            {
                _id: bid(),
                label: 'GitHub',
                url: 'https://github.com/astromech',
                newTab: true,
            },
        ],
    };

    // Footer menu — FR
    const footerMenuFr = {
        items: [
            { _id: bid(), label: 'Blog', url: '/fr/blog' },
            { _id: bid(), label: 'Clients', url: '/fr/customers' },
            { _id: bid(), label: 'À propos', url: '/fr/about' },
            {
                _id: bid(),
                label: 'GitHub',
                url: 'https://github.com/astromech',
                newTab: true,
            },
        ],
    };

    await upsertSetting('plugin:astromech-menus:/menus/main', menusShared);
    await upsertSetting('plugin:astromech-menus:/menus/main:en', mainMenuEn);
    await upsertSetting('plugin:astromech-menus:/menus/main:fr', mainMenuFr);
    await upsertSetting('plugin:astromech-menus:/menus/footer', menusShared);
    await upsertSetting('plugin:astromech-menus:/menus/footer:en', footerMenuEn);
    await upsertSetting('plugin:astromech-menus:/menus/footer:fr', footerMenuFr);
    console.log('  Wrote menus plugin settings (main + footer, en + fr)\n');

    // -------------------------------------------------------------------------
    // Redirects
    // -------------------------------------------------------------------------
    await db.insert(redirectsTable).values([
        {
            id: crypto.randomUUID(),
            from: '/old-home',
            to: '/',
            status: '301',
            enabled: true,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: crypto.randomUUID(),
            from: '/blog/old-post',
            to: '/blog/getting-started-with-astromech',
            status: '301',
            enabled: true,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: crypto.randomUUID(),
            from: '/customers/index',
            to: '/customers',
            status: '302',
            enabled: true,
            createdAt: now,
            updatedAt: now,
        },
    ]);
    console.log('  Created 3 redirects\n');

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Seed complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Media          3  (real JPEG bytes, written to demo/public/uploads/)');
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
    console.log('  Globals        3  settings keys (globals, globals:en, globals:fr)');
    console.log(
        '  Menus          6  settings keys (main + footer, shared + en + fr each)'
    );
    console.log('  Redirects      3');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Admin login: admin@astromech.dev / password');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

seed().catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
