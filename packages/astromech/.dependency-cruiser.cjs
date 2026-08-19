/**
 * Dependency-direction guardrail — modular (screaming-architecture) DAG.
 *
 * Two families of rule live here, in two labelled blocks.
 *
 * **Layer rules** are generated from the `LAYERS` table below. Imports may only
 * point DOWN the table; upward edges are forbidden. Peers inside a layer may
 * read one another. Adding a directory to `src/` means adding one word to that
 * table — and `directory-must-be-in-a-layer` fails the scan until somebody does,
 * so the guardrail cannot silently stop covering new code.
 *
 * **Environment rules** say what may load where, and they are the ones that have
 * caught real defects: admin code runs in a browser and must not pull the config
 * virtual module into the bundle, and the fetch Client talks to the server over
 * the wire rather than importing it. They have two siblings outside this file —
 * `npm run check:config` and `npm run check:node-imports` — and the block below
 * says what each covers.
 *
 * This config scans CORE ONLY (`src/`). Cross-package isolation is enforced by
 * package `exports` boundaries, not this scan.
 *
 * The composition root is the root-level src modules (astromech.ts,
 * plugin-access.ts) — not a layer directory. It sits at the
 * top of the DAG and may import from any layer below it.
 *
 * Domains may read one another. The module split is for organisation, not
 * isolation: a reverse lookup that needs an entry's title and a user's name is
 * one clean call each, and forbidding it only pushed the same work somewhere
 * worse — a second wire shape for the same concept, resolved in the browser.
 * What the split defends against is functionality smeared across the codebase,
 * which no dependency rule can detect; the generated no-upward rules still hold
 * the shape that matters. The domains sit outside `no-circular` because they
 * have pre-existing internal cycles — worth bringing into scope once those are
 * cleaned up, since a cycle IS the entanglement worth catching.
 *
 * The plugin runtime is a pure capability. It declares each slice of a domain it
 * needs as a port typed only from leaves — `plugins/runtime/entry-access.ts` for
 * the entry types it mounts, `plugins/runtime/notify-access.ts` for `ctx.notify`
 * — and the owning domain injects the implementation at boot
 * (`entries/plugin-access.ts`, `notifications/plugin-access.ts`).
 */

// ─────────────────────────────────────────────────────────────────────────────
// The layer table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every top-level directory under `src/`, ordered from the top of the DAG to the
 * bottom. This is the single source for the generated rules below; nothing else
 * in this file hand-enumerates a sibling directory.
 */
const LAYERS = [
    ['integrations', 'admin', 'codegen'],
    ['transport', 'policies'],
    ['entries', 'media', 'users', 'settings', 'notifications'],
    [
        'config',
        'database',
        'storage',
        'email',
        'ai',
        'cron',
        'cloudflare',
        'request-context',
        'fields',
        'permissions',
        'plugins/runtime',
    ],
    ['types', 'utilities', 'errors'],
];

/** What each layer is called, used in generated rule names and comments. */
const LAYER_NAMES = ['entrypoints', 'delivery', 'domains', 'capabilities', 'leaves'];

/**
 * Directories whose no-upward rule is written by hand further down, because it
 * carries an exemption the table cannot express: `database/schema.ts` is the
 * table aggregator, and the leaves have two type-only carve-outs. They stay in
 * `LAYERS` so `directory-must-be-in-a-layer` still accounts for them.
 */
const HAND_WRITTEN_NO_UPWARD = new Set(['database', 'types', 'utilities', 'errors']);

/**
 * Directories that are not a layer. `exports/` holds the tsup entry barrels,
 * which re-export from every layer by design.
 */
const UNLAYERED = ['exports'];

/**
 * The composition root: root-level src modules (not in any layer directory).
 * `astromech.ts` is the front door (createAstromech/getAstromech) and runs the
 * boot sequence; `plugin-access.ts` is wiring it calls. They sit at the top of
 * the DAG: they may import any layer, no layer below the entrypoints tier may
 * import them, and no browser bundle may hold them (they drag
 * `virtual:astromech/config` and the whole driver graph with them).
 */
const COMPOSITION_ROOT = '^src/(astromech|plugin-access)\\.ts$';

/**
 * Sources exempt from their layer's generated no-upward rule.
 *
 * - `transport/cli/` is a standalone entrypoint: it resolves its own config and
 *   boots itself, so it reaches `boot/` and `codegen/` the way `integrations/`
 *   does.
 * - `transport/tools/` and `transport/mcp/` read the generated method manifest
 *   from `codegen/`. The manifest is data the transports project, not
 *   composition — it moves out from under `codegen/` in
 *   `roadmap/completed/manifest-driven-transports.md`.
 * - `request-context/request-context.ts` reaches `users/session` for the one
 *   thing it needs: turning request headers into an identity. The edge is a
 *   DYNAMIC import inside the async getter, which is what keeps the module
 *   service-free at load time — a port would put the implementation in a
 *   registry slot, and `decisions/0061-identity-resolves-on-demand.md` records
 *   why this one does not get a slot.
 */
const NO_UPWARD_EXEMPT =
    '^src/(transport/(cli|tools|mcp)/|request-context/request-context\\.ts$)';

// ─────────────────────────────────────────────────────────────────────────────
// The browser boundary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A file a browser bundle may hold — the admin SPA and the fetch Client alike —
 * that does not live in a browser-safe directory. The marker is the filename so
 * the constraint is legible at review time without running this scan;
 * `shared-files-stay-browser-safe` keeps it honest.
 */
const SHARED_MARKER = '\\.shared\\.(ts|tsx)$';

/**
 * Directories a browser bundle may hold: the pure leaves, plus the field
 * definitions the admin renders from.
 */
const BROWSER_SAFE = new Set([...LAYERS[4], 'fields']);

/**
 * Everything a browser bundle may NOT hold — the domains, the server-side
 * capabilities, the transports, the policies and the composition root. Pulling
 * any of these into the admin drags `virtual:astromech/config` (and with it the
 * whole driver and plugin graph) into the client bundle. The composition root is
 * enforced separately via `COMPOSITION_ROOT` in the browser rules below, since it
 * is root-level files rather than a layer directory.
 */
const SERVER_ONLY = LAYERS.slice(1)
    .flat()
    .filter((directory) => !BROWSER_SAFE.has(directory));

// ─────────────────────────────────────────────────────────────────────────────
// Generation
// ─────────────────────────────────────────────────────────────────────────────

/** `['entries', 'plugins/runtime']` → `'^src/(entries|plugins/runtime)/'`. */
const under = (directories) => `^src/(${directories.join('|')})/`;

const KNOWN_DIRECTORIES = [...LAYERS.flat(), ...UNLAYERED];

const layerRules = LAYERS.flatMap((layer, index) => {
    const above = LAYERS.slice(0, index).flat();
    const from = layer.filter((directory) => !HAND_WRITTEN_NO_UPWARD.has(directory));
    if (above.length === 0 || from.length === 0) return [];

    return {
        name: `${LAYER_NAMES[index]}-no-upward`,
        comment: `Generated from the LAYERS table. The ${LAYER_NAMES[index]} layer (${layer.join(', ')}) sits below ${above.join(', ')} and must not import any of them. Fix the direction rather than the rule: an upward edge is a port waiting to be declared, the way plugins/runtime/entry-access.ts declares the entries slice the plugin runtime needs. Exemptions are listed on NO_UPWARD_EXEMPT with their reason.`,
        severity: 'error',
        from: { path: under(from), pathNot: NO_UPWARD_EXEMPT },
        to: { path: `${under(above)}|${COMPOSITION_ROOT}` },
    };
});

module.exports = {
    forbidden: [
        // ─────────────────────────────────────────────────────────────────────
        // LAYER RULES — generated from LAYERS, plus the four that carry an
        // exemption the table cannot express.
        // ─────────────────────────────────────────────────────────────────────
        ...layerRules,
        {
            name: 'directory-must-be-in-a-layer',
            comment:
                'Every top-level directory under src/ must appear in the LAYERS table, so a new directory is covered by the rules above from its first commit. This is the check that stops the next notifications/ — a domain that existed for months while every hand-written rule failed to mention it. Add the directory to its layer in LAYERS; if it is genuinely not a layer (the exports/ barrels), add it to UNLAYERED with the reason. It fires on the unlisted directory IMPORTING something, which every real module does; a directory that imports nothing at all is dead code and out of scope.',
            severity: 'error',
            from: { path: `^src/(?!(${KNOWN_DIRECTORIES.join('|')})/)[^/]+/` },
            // Any dependency at all, third-party included.
            to: {},
        },
        {
            name: 'database-no-upward-except-aggregate',
            comment:
                'The database capability must not import domains or upper layers — EXCEPT database/schema.ts, the table aggregator that re-exports each domain schema to form the `astromech/database/schema` public surface. Every other database/ file stays below the domains, and reaches a table through the aggregator rather than the domain (see database/types.ts).',
            severity: 'error',
            from: { path: '^src/database/', pathNot: '^src/database/schema\\.ts$' },
            to: { path: under(LAYERS.slice(0, 3).flat()) },
        },
        {
            name: 'leaves-are-pure',
            comment:
                'The pure leaves (types, utilities, errors) sit at the very bottom of the DAG: they define contracts and helpers and may import ONLY other leaves (or third-party packages) — never a domain, a capability, or an upper layer. EXEMPT: the two public authoring contracts, types/config.ts (AstromechConfig — composes EntryStorage/ImageFormat) and types/plugins.ts (PluginDefinition — composes the Kysely DB and the TableDescriptor a plugin ships as its schema). Both compose at the TYPE level only, with no runtime coupling.',
            severity: 'error',
            from: {
                path: under(LAYERS[4]),
                pathNot: '^src/types/(config|plugins)\\.ts$',
            },
            to: { path: `^src/(?!(${LAYERS[4].join('|')})/)` },
        },
        {
            name: 'transport-server-no-reach-client-or-admin',
            comment:
                'The server transport composes domains + policies. It must not import the fetch Client (its sibling under transport/http/client) or admin — those are downstream consumers. The client subtree is excluded as a source so the rule governs only the server half.',
            severity: 'error',
            from: { path: '^src/transport/', pathNot: '^src/transport/http/client/' },
            to: { path: '^src/transport/http/client/|^src/admin/' },
        },
        {
            name: 'no-circular',
            comment:
                'Cyclic dependencies break the acyclic layer graph and tree-shaking. Scoped to the clean capability/delivery spine: the whole capability and delivery layers, plus the composition root. The five domains stay out of scope for now (their own internal cycles are a separate cleanup).',
            severity: 'warn',
            from: { path: `${COMPOSITION_ROOT}|${under([...LAYERS[1], ...LAYERS[3]])}` },
            to: { circular: true },
        },

        // ─────────────────────────────────────────────────────────────────────
        // ENVIRONMENT RULES — what may load where. Three checks cover this, and
        // the other two are not dependency rules:
        //
        //   npm run check:node-imports  — a plugin package loads in plain Node
        //                                 and cannot resolve `virtual:`.
        //   npm run check:config        — the Astro integration loads at config
        //                                 time and must not reach a service.
        //   the rules below             — the admin bundle runs in a browser.
        // ─────────────────────────────────────────────────────────────────────
        {
            name: 'admin-only-client-and-pure-leaves',
            comment:
                'The admin SPA holds the Client and may use browser-safe code: the pure leaves (types, utilities, errors), the field definitions it renders from (fields), the fetch Client at transport/http/client/ that it is built around, and any *.shared.ts file. It must not otherwise reach into domains, capabilities, transports, policies or boot — a domain service drags virtual:astromech/config, and with it every driver and plugin the config names, into the client bundle. A pure function the browser needs from a domain becomes a *.shared.ts file next to its domain rather than an entry on a list here.',
            severity: 'error',
            from: { path: '^src/admin/' },
            to: {
                path: `${under(SERVER_ONLY)}|${COMPOSITION_ROOT}`,
                pathNot: `${SHARED_MARKER}|^src/transport/http/client/`,
            },
        },
        {
            name: 'shared-files-stay-browser-safe',
            comment:
                'A *.shared.ts file is a domain leaf the admin bundle is allowed to hold, so it may import only what the admin itself may import: pure leaves, fields, and other *.shared.ts files. Without this, the marker is a way to launder a server module into the browser — rename a file that reaches a service and the whole config graph follows it into the bundle.',
            severity: 'error',
            from: { path: SHARED_MARKER },
            to: {
                path: `${under(SERVER_ONLY)}|${COMPOSITION_ROOT}`,
                pathNot: SHARED_MARKER,
            },
        },
        {
            name: 'client-is-over-the-wire',
            comment:
                'The fetch Client (astromech/fetch) lives at transport/http/client/ but talks to the HTTP API over the wire — it is the client *half* of the http transport, not part of the server. It must not reach into domains, capabilities, policies, the rest of transport (the server), boot, or admin — only the pure leaves and any *.shared.ts file, which is the same allowance the admin has and is held browser-safe by shared-files-stay-browser-safe. Its own subtree is exempt so it may have internal imports.',
            severity: 'error',
            from: { path: '^src/transport/http/client/' },
            to: {
                path: `${under([...SERVER_ONLY, 'admin'])}|^src/fields/|${COMPOSITION_ROOT}`,
                pathNot: `${SHARED_MARKER}|^src/transport/http/client/`,
            },
        },
    ],
    options: {
        tsConfig: { fileName: 'tsconfig.json' },
        tsPreCompilationDeps: true,
        doNotFollow: { path: 'node_modules' },
        exclude: { path: '(\\.test\\.ts$|/test/|^packages/.+/dist/)' },
        enhancedResolveOptions: {
            // Imports are written with `.js` extensions but resolve to `.ts` sources;
            // dependency-cruiser maps these via the tsConfig + the extension list below.
            extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
            mainFields: ['module', 'main', 'types', 'typings'],
            conditionNames: ['import', 'require', 'node', 'default', 'types'],
        },
    },
};
