/**
 * Seed script — populates the dev database with comprehensive demo data.
 *
 * Clears all entities, relationships, and media on each run (idempotent).
 * Preserves users — checks by email and creates if missing.
 *
 * Uses better-auth's own hashPassword so no extra dependencies are required.
 *
 * Usage (from project root):
 *   npm run seed
 */

import { drizzle } from 'drizzle-orm/libsql';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import * as schema from '../src/db/schema.js';

const db = drizzle({ connection: { url: process.env.DATABASE_URL ?? 'file:./demo/database.db' } });

const PASSWORD = 'password';
const now = new Date();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertUser(email: string, name: string): Promise<string> {
    const existing = await db
        .select({ id: schema.usersTable.id })
        .from(schema.usersTable)
        .where(eq(schema.usersTable.email, email));

    if (existing.length > 0 && existing[0] !== undefined) {
        return existing[0].id;
    }

    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const hashedPassword = await hashPassword(PASSWORD);

    await db.insert(schema.usersTable).values({
        id: userId,
        email,
        name,
        emailVerified: true,
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

    return userId;
}

type RelationshipInput = {
    sourceId: string;
    name: string;
    targetId: string;
    targetType: 'entity' | 'user' | 'media';
    position: number;
};

async function insertRelationships(rows: RelationshipInput[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(schema.relationshipsTable).values(
        rows.map((r) => ({
            id: crypto.randomUUID(),
            sourceId: r.sourceId,
            sourceType: 'entity' as const,
            name: r.name,
            targetId: r.targetId,
            targetType: r.targetType,
            position: r.position,
            createdAt: now,
        }))
    );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
    console.log('Seeding database…\n');

    // -------------------------------------------------------------------------
    // Clear existing data (keep users)
    // -------------------------------------------------------------------------
    await db.delete(schema.relationshipsTable).where(sql`1=1`);
    await db.delete(schema.entitiesTable).where(sql`1=1`);
    await db.delete(schema.mediaTable).where(sql`1=1`);
    console.log('✓ Cleared entities, relationships, and media\n');

    // -------------------------------------------------------------------------
    // Users
    // -------------------------------------------------------------------------
    const adminId = await upsertUser('admin@astromech.dev', 'Alex Admin');
    const editorId = await upsertUser('editor@astromech.dev', 'Emma Editor');
    const authorId = await upsertUser('author@astromech.dev', 'Sam Author');
    console.log('✓ Created 3 users (admin, editor, author)\n');

    // -------------------------------------------------------------------------
    // Media
    // -------------------------------------------------------------------------
    const mediaHeroBannerId = crypto.randomUUID();
    const mediaAuthorPortraitId = crypto.randomUUID();
    const mediaTechArticleId = crypto.randomUUID();
    const mediaDesignShowcaseId = crypto.randomUUID();
    const mediaOfficeSceneId = crypto.randomUUID();
    const mediaNatureBackgroundId = crypto.randomUUID();
    const mediaProductShotId = crypto.randomUUID();
    const mediaTeamPhotoId = crypto.randomUUID();

    await db.insert(schema.mediaTable).values([
        {
            id: mediaHeroBannerId,
            filename: 'hero-banner.jpg',
            mimeType: 'image/jpeg',
            size: 734208,
            url: 'https://picsum.photos/seed/hero/1920/1080',
            width: 1920,
            height: 1080,
            alt: 'Hero banner image',
            fields: {
                photographer: 'Unsplash Contributor',
                copyright: '© 2026 Picsum Photos',
            },
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: mediaAuthorPortraitId,
            filename: 'author-portrait.jpg',
            mimeType: 'image/jpeg',
            size: 204800,
            url: 'https://picsum.photos/seed/portrait/800/600',
            width: 800,
            height: 600,
            alt: 'Author portrait',
            fields: {
                photographer: 'Unsplash Contributor',
                copyright: '© 2026 Picsum Photos',
            },
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: mediaTechArticleId,
            filename: 'tech-article.jpg',
            mimeType: 'image/jpeg',
            size: 358400,
            url: 'https://picsum.photos/seed/tech/1200/800',
            width: 1200,
            height: 800,
            alt: 'Technology article header image',
            fields: {
                photographer: 'Unsplash Contributor',
                copyright: '© 2026 Picsum Photos',
            },
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: mediaDesignShowcaseId,
            filename: 'design-showcase.jpg',
            mimeType: 'image/jpeg',
            size: 421888,
            url: 'https://picsum.photos/seed/design/1200/800',
            width: 1200,
            height: 800,
            alt: 'Design showcase image',
            fields: {
                photographer: 'Unsplash Contributor',
                copyright: '© 2026 Picsum Photos',
            },
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: mediaOfficeSceneId,
            filename: 'office-scene.jpg',
            mimeType: 'image/jpeg',
            size: 312320,
            url: 'https://picsum.photos/seed/office/1200/675',
            width: 1200,
            height: 675,
            alt: 'Office scene',
            fields: {
                photographer: 'Unsplash Contributor',
                copyright: '© 2026 Picsum Photos',
            },
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: mediaNatureBackgroundId,
            filename: 'nature-background.jpg',
            mimeType: 'image/jpeg',
            size: 614400,
            url: 'https://picsum.photos/seed/nature/1600/900',
            width: 1600,
            height: 900,
            alt: 'Nature background',
            fields: {
                photographer: 'Unsplash Contributor',
                copyright: '© 2026 Picsum Photos',
            },
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: mediaProductShotId,
            filename: 'product-shot.jpg',
            mimeType: 'image/jpeg',
            size: 163840,
            url: 'https://picsum.photos/seed/product/800/800',
            width: 800,
            height: 800,
            alt: 'Product shot',
            fields: {
                photographer: 'Unsplash Contributor',
                copyright: '© 2026 Picsum Photos',
            },
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
        {
            id: mediaTeamPhotoId,
            filename: 'team-photo.jpg',
            mimeType: 'image/jpeg',
            size: 491520,
            url: 'https://picsum.photos/seed/team/1200/800',
            width: 1200,
            height: 800,
            alt: 'Team photo',
            fields: {
                photographer: 'Unsplash Contributor',
                copyright: '© 2026 Picsum Photos',
            },
            createdAt: now,
            updatedAt: now,
            createdBy: adminId,
        },
    ]);
    console.log('✓ Created 8 media items\n');

    // -------------------------------------------------------------------------
    // Categories
    // -------------------------------------------------------------------------
    const catTechnologyId = crypto.randomUUID();
    const catDesignId = crypto.randomUUID();
    const catBusinessId = crypto.randomUUID();
    const catTutorialId = crypto.randomUUID();

    await db.insert(schema.entitiesTable).values([
        {
            id: catTechnologyId,
            collection: 'categories',
            slug: 'technology',
            title: 'Technology',
            fields: { description: 'Latest in tech and software' },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: catDesignId,
            collection: 'categories',
            slug: 'design',
            title: 'Design',
            fields: { description: 'UI/UX and visual design' },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: catBusinessId,
            collection: 'categories',
            slug: 'business',
            title: 'Business',
            fields: { description: 'Strategy and entrepreneurship' },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: catTutorialId,
            collection: 'categories',
            slug: 'tutorial',
            title: 'Tutorial',
            fields: { description: 'Step-by-step guides and how-tos' },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
    ]);
    console.log('✓ Created 4 categories\n');

    // -------------------------------------------------------------------------
    // Tags
    // -------------------------------------------------------------------------
    const tagAstromechId = crypto.randomUUID();
    const tagWebDevId = crypto.randomUUID();
    const tagCssId = crypto.randomUUID();
    const tagTypescriptId = crypto.randomUUID();
    const tagReactId = crypto.randomUUID();

    await db.insert(schema.entitiesTable).values([
        {
            id: tagAstromechId,
            collection: 'tags',
            slug: 'astromech',
            title: 'Astromech',
            fields: { color: '#6366f1' },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: tagWebDevId,
            collection: 'tags',
            slug: 'web-dev',
            title: 'Web Dev',
            fields: { color: '#0ea5e9' },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: tagCssId,
            collection: 'tags',
            slug: 'css',
            title: 'CSS',
            fields: { color: '#f97316' },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: tagTypescriptId,
            collection: 'tags',
            slug: 'typescript',
            title: 'TypeScript',
            fields: { color: '#3b82f6' },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: tagReactId,
            collection: 'tags',
            slug: 'react',
            title: 'React',
            fields: { color: '#06b6d4' },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
    ]);
    console.log('✓ Created 5 tags\n');

    // -------------------------------------------------------------------------
    // Pages
    // -------------------------------------------------------------------------
    const pageHomeId = crypto.randomUUID();
    const pageAboutId = crypto.randomUUID();
    const pageContactId = crypto.randomUUID();

    await db.insert(schema.entitiesTable).values([
        {
            id: pageHomeId,
            collection: 'pages',
            slug: 'home',
            title: 'Home',
            fields: {
                sections: [
                    {
                        title: 'Welcome to Astromech',
                        content:
                            '<h2>The CMS for modern developers</h2><p>Build fast, deploy anywhere.</p>',
                        layout: 'full-width',
                    },
                    {
                        title: 'Features',
                        content: '<p>Everything you need in one package.</p>',
                        layout: 'two-column',
                    },
                ],
                template: 'landing',
                theme_color: '#6366f1',
                noindex: false,
            },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: pageAboutId,
            collection: 'pages',
            slug: 'about',
            title: 'About',
            fields: {
                sections: [
                    {
                        title: 'Our Story',
                        content:
                            '<p>Astromech was built for developers who want a CMS that works with them, not against them.</p>',
                        layout: 'full-width',
                    },
                ],
                template: 'default',
                theme_color: '#0ea5e9',
                noindex: false,
            },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: pageContactId,
            collection: 'pages',
            slug: 'contact',
            title: 'Contact',
            fields: {
                sections: [
                    {
                        title: 'Get in Touch',
                        content: "<p>We'd love to hear from you.</p>",
                        layout: 'full-width',
                    },
                ],
                template: 'default',
                noindex: true,
            },
            status: 'draft',
            createdAt: now,
            updatedAt: now,
        },
    ]);

    await insertRelationships([
        // Home: author → admin, category → Technology
        {
            sourceId: pageHomeId,
            name: 'author',
            targetId: adminId,
            targetType: 'user',
            position: 0,
        },
        {
            sourceId: pageHomeId,
            name: 'category',
            targetId: catTechnologyId,
            targetType: 'entity',
            position: 0,
        },
        // About: author → editor, og_image → hero-banner
        {
            sourceId: pageAboutId,
            name: 'author',
            targetId: editorId,
            targetType: 'user',
            position: 0,
        },
        {
            sourceId: pageAboutId,
            name: 'og_image',
            targetId: mediaHeroBannerId,
            targetType: 'media',
            position: 0,
        },
        // Contact: author → author user
        {
            sourceId: pageContactId,
            name: 'author',
            targetId: authorId,
            targetType: 'user',
            position: 0,
        },
    ]);
    console.log('✓ Created 3 pages\n');

    // -------------------------------------------------------------------------
    // Posts
    // -------------------------------------------------------------------------
    const post1Id = crypto.randomUUID();
    const post2Id = crypto.randomUUID();
    const post3Id = crypto.randomUUID();
    const post4Id = crypto.randomUUID();
    const post5Id = crypto.randomUUID();
    const post6Id = crypto.randomUUID();

    await db.insert(schema.entitiesTable).values([
        {
            id: post1Id,
            collection: 'posts',
            slug: 'getting-started-with-astromech',
            title: 'Getting Started with Astromech',
            fields: {
                body: "<p>Astromech is a lightweight, developer-first CMS built on Astro and Cloudflare Workers. Getting started takes only a few minutes — install the integration, configure your collections, and you're ready to manage content.</p><p>Unlike traditional CMS platforms, Astromech stores your content in a SQLite database on Cloudflare D1 and serves it at the edge, giving you sub-millisecond response times worldwide. Your schema lives in code, version controlled alongside your project.</p><p>In this guide we'll walk through installing Astromech, defining your first collection, and querying content from your Astro pages using the server SDK.</p>",
                excerpt:
                    'A step-by-step introduction to installing and configuring Astromech in your Astro project.',
            },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: post2Id,
            collection: 'posts',
            slug: 'building-with-typescript-and-astro',
            title: 'Building with TypeScript and Astro',
            fields: {
                body: "<p>TypeScript and Astro are a natural pairing. Astro's component syntax compiles down to zero-JS HTML by default, while TypeScript gives you the type safety and IDE tooling that makes large codebases maintainable over time.</p><p>Astromech takes this further by auto-generating fully typed SDK clients from your collection config. Every call to <code>Astromech.collections.posts.all()</code> is aware of your exact field shapes — no manual type definitions required.</p><p>We'll explore the TypeScript patterns used throughout Astromech, including discriminated unions for field types, strict null checking, and how the dual-client architecture keeps server and browser code cleanly separated.</p>",
                excerpt:
                    'How TypeScript and Astro work together, and how Astromech leverages both for end-to-end type safety.',
            },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: post3Id,
            collection: 'posts',
            slug: 'css-architecture-for-large-projects',
            title: 'CSS Architecture for Large Projects',
            fields: {
                body: "<p>Scaling CSS is one of the hardest problems in front-end development. Without a clear architecture, stylesheets grow into an unmaintainable tangle of overrides and specificity wars. BEM, utility-first, and CSS Modules each solve different pieces of the puzzle.</p><p>Astromech's admin UI uses a hybrid approach: BEM naming for component structure, CSS custom properties for theming, and scoped component styles to prevent leakage. This gives us the explicitness of BEM without the verbosity that comes from fighting cascade inheritance.</p><p>We'll look at how to structure your CSS for a project that needs to grow from five screens to fifty without a full rewrite.</p>",
                excerpt:
                    'Practical strategies for structuring CSS in large Astro projects, drawing on the lessons from building Astromech.',
            },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: post4Id,
            collection: 'posts',
            slug: 'the-future-of-content-management',
            title: 'The Future of Content Management',
            fields: {
                body: '<p>The content management landscape is shifting. Monolithic CMS platforms built for the WordPress era are giving way to headless architectures that separate content storage from presentation. The next wave is going further — edge-native, developer-defined, and deeply integrated with modern deployment infrastructure.</p><p>Astromech represents a bet on this future: a CMS that deploys alongside your code, runs on the same edge network as your application, and treats content schemas as first-class code artifacts rather than database configuration.</p><p>In this piece we examine the forces driving this shift, the trade-offs involved, and where we see content management heading over the next few years.</p>',
                excerpt:
                    'An analysis of where headless CMS is heading and why edge-native architectures are becoming the default.',
            },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: post5Id,
            collection: 'posts',
            slug: 'react-component-patterns',
            title: 'React Component Patterns',
            fields: {
                body: "<p>React component design has matured considerably since the introduction of hooks. Today the community has largely converged on a handful of patterns that balance flexibility with predictability: compound components, render props for inversion of control, and context-based composition for deeply nested state.</p><p>Astromech's admin UI is built with React and uses these patterns extensively. The field system, for example, uses a compound component pattern that lets field groups compose arbitrary field types without any central registry.</p><p>We'll cover the patterns we found most useful and the ones we tried and abandoned, with concrete examples from the Astromech codebase.</p>",
                excerpt:
                    'The React component patterns that power the Astromech admin UI, with examples and rationale.',
            },
            status: 'draft',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: post6Id,
            collection: 'posts',
            slug: 'deploying-to-cloudflare-workers',
            title: 'Deploying to Cloudflare Workers',
            fields: {
                body: '<p>Cloudflare Workers provide a globally distributed JavaScript runtime that executes your code at the edge, within milliseconds of your users. Paired with D1 for SQLite storage and R2 for object storage, they give you a complete serverless backend with no cold starts and no region lock-in.</p><p>Deploying Astromech to Cloudflare Workers takes three steps: configure your wrangler.toml with D1 and R2 bindings, run <code>wrangler deploy</code>, and point your DNS records at the Worker. The entire CMS — API, admin panel, and content delivery — runs as a single Worker at the edge.</p><p>This post walks through the full deployment process, including how to run database migrations against D1 and configure R2 CORS policies for media uploads.</p>',
                excerpt:
                    'A complete guide to deploying Astromech on Cloudflare Workers with D1 and R2 bindings configured.',
            },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
    ]);

    await insertRelationships([
        // Post 1: Getting Started
        {
            sourceId: post1Id,
            name: 'featured_image',
            targetId: mediaTechArticleId,
            targetType: 'media',
            position: 0,
        },
        {
            sourceId: post1Id,
            name: 'category',
            targetId: catTutorialId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post1Id,
            name: 'tags',
            targetId: tagAstromechId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post1Id,
            name: 'tags',
            targetId: tagWebDevId,
            targetType: 'entity',
            position: 1,
        },
        {
            sourceId: post1Id,
            name: 'author',
            targetId: adminId,
            targetType: 'user',
            position: 0,
        },

        // Post 2: Building with TypeScript
        {
            sourceId: post2Id,
            name: 'featured_image',
            targetId: mediaHeroBannerId,
            targetType: 'media',
            position: 0,
        },
        {
            sourceId: post2Id,
            name: 'category',
            targetId: catTechnologyId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post2Id,
            name: 'tags',
            targetId: tagTypescriptId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post2Id,
            name: 'tags',
            targetId: tagWebDevId,
            targetType: 'entity',
            position: 1,
        },
        {
            sourceId: post2Id,
            name: 'author',
            targetId: editorId,
            targetType: 'user',
            position: 0,
        },

        // Post 3: CSS Architecture
        {
            sourceId: post3Id,
            name: 'featured_image',
            targetId: mediaDesignShowcaseId,
            targetType: 'media',
            position: 0,
        },
        {
            sourceId: post3Id,
            name: 'category',
            targetId: catDesignId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post3Id,
            name: 'tags',
            targetId: tagCssId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post3Id,
            name: 'tags',
            targetId: tagWebDevId,
            targetType: 'entity',
            position: 1,
        },
        {
            sourceId: post3Id,
            name: 'author',
            targetId: authorId,
            targetType: 'user',
            position: 0,
        },

        // Post 4: Future of CMS
        {
            sourceId: post4Id,
            name: 'featured_image',
            targetId: mediaOfficeSceneId,
            targetType: 'media',
            position: 0,
        },
        {
            sourceId: post4Id,
            name: 'category',
            targetId: catBusinessId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post4Id,
            name: 'tags',
            targetId: tagAstromechId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post4Id,
            name: 'tags',
            targetId: tagTypescriptId,
            targetType: 'entity',
            position: 1,
        },
        {
            sourceId: post4Id,
            name: 'author',
            targetId: adminId,
            targetType: 'user',
            position: 0,
        },

        // Post 5: React Patterns (draft)
        {
            sourceId: post5Id,
            name: 'featured_image',
            targetId: mediaProductShotId,
            targetType: 'media',
            position: 0,
        },
        {
            sourceId: post5Id,
            name: 'category',
            targetId: catTechnologyId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post5Id,
            name: 'tags',
            targetId: tagReactId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post5Id,
            name: 'tags',
            targetId: tagTypescriptId,
            targetType: 'entity',
            position: 1,
        },
        {
            sourceId: post5Id,
            name: 'author',
            targetId: editorId,
            targetType: 'user',
            position: 0,
        },

        // Post 6: Deploying to Cloudflare
        {
            sourceId: post6Id,
            name: 'featured_image',
            targetId: mediaNatureBackgroundId,
            targetType: 'media',
            position: 0,
        },
        {
            sourceId: post6Id,
            name: 'category',
            targetId: catTutorialId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post6Id,
            name: 'tags',
            targetId: tagWebDevId,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: post6Id,
            name: 'tags',
            targetId: tagAstromechId,
            targetType: 'entity',
            position: 1,
        },
        {
            sourceId: post6Id,
            name: 'author',
            targetId: adminId,
            targetType: 'user',
            position: 0,
        },
    ]);
    console.log('✓ Created 6 posts\n');

    // -------------------------------------------------------------------------
    // Showcase
    // -------------------------------------------------------------------------
    const showcaseFullId = crypto.randomUUID();
    const showcaseMinimalId = crypto.randomUUID();

    await db.insert(schema.entitiesTable).values([
        {
            id: showcaseFullId,
            collection: 'showcase',
            slug: 'full-field-demo',
            title: 'Full Field Demo',
            fields: {
                summary:
                    'A comprehensive demonstration of all available field types in Astromech.',
                score: 85,
                rating: 4,
                published_date: '2026-01-15',
                active: true,
                color_theme: '#6366f1',
                website: 'https://astromech.dev',
                contact_email: 'hello@astromech.dev',
                status_select: 'active',
                features: ['Dark Mode', 'Notifications', 'API Access'],
                priority: 'high',
                tags: ['frontend', 'backend'],
                cta_link: {
                    href: 'https://astromech.dev/docs',
                    label: 'Read the Docs',
                    target: '_blank',
                },
                metadata: {
                    version: '1.0.0',
                    environment: 'production',
                    region: 'us-east',
                },
                config: {
                    theme: 'dark',
                    locale: 'en',
                    features: { analytics: true, notifications: false },
                },
                advanced_settings: { cache_ttl: 3600, robots: 'index, follow' },
                en_content: 'Welcome to the showcase.',
                fr_content: 'Bienvenue dans la vitrine.',
                es_content: 'Bienvenido a la muestra.',
            },
            status: 'published',
            createdAt: now,
            updatedAt: now,
        },
        {
            id: showcaseMinimalId,
            collection: 'showcase',
            slug: 'minimal-demo',
            title: 'Minimal Demo',
            fields: {
                summary: 'A minimal showcase entry.',
                score: 40,
                active: false,
                status_select: 'pending',
                features: ['Dark Mode'],
                priority: 'low',
                cta_link: {
                    href: 'https://example.com',
                    label: 'Example',
                    target: '_self',
                },
                metadata: { env: 'staging' },
            },
            status: 'draft',
            createdAt: now,
            updatedAt: now,
        },
    ]);

    await insertRelationships([
        // Full showcase: hero_image, gallery (2), related_posts (2)
        {
            sourceId: showcaseFullId,
            name: 'hero_image',
            targetId: mediaHeroBannerId,
            targetType: 'media',
            position: 0,
        },
        {
            sourceId: showcaseFullId,
            name: 'gallery',
            targetId: mediaTechArticleId,
            targetType: 'media',
            position: 0,
        },
        {
            sourceId: showcaseFullId,
            name: 'gallery',
            targetId: mediaDesignShowcaseId,
            targetType: 'media',
            position: 1,
        },
        {
            sourceId: showcaseFullId,
            name: 'related_posts',
            targetId: post1Id,
            targetType: 'entity',
            position: 0,
        },
        {
            sourceId: showcaseFullId,
            name: 'related_posts',
            targetId: post2Id,
            targetType: 'entity',
            position: 1,
        },
    ]);
    console.log('✓ Created 2 showcase entries\n');

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Seed complete — summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Users         3  (admin, editor, author)');
    console.log('  Media         8  items');
    console.log('  Categories    4  (Technology, Design, Business, Tutorial)');
    console.log('  Tags          5  (Astromech, Web Dev, CSS, TypeScript, React)');
    console.log('  Pages         3  (1 draft, 2 published)');
    console.log('  Posts         6  (1 draft, 5 published)');
    console.log('  Showcase      2  (1 draft, 1 published)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Login: admin@astromech.dev / password');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

seed().catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
