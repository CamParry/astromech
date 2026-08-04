/**
 * Dependency-direction guardrail — modular (screaming-architecture) DAG.
 *
 * Imports may only point DOWN this list; upward edges are forbidden. Peer
 * domains may read one another.
 *
 *   routes · admin · boot · codegen · cli        entrypoints & composition root
 *   transport (http · local · mcp · cli)           delivery
 *     · http/client = the fetch Client (consumes the HTTP API over the wire;
 *       client half of the transport, nested but kept a distinct DAG node)
 *   policies                                       permission / confirmation wrappers
 *   content                                        downstream domain — may import entries
 *   entries · media · users · settings             domains — siblings, may read each other
 *   plugins/runtime · database · storage · email ·  capabilities
 *     cron · request-context · fields · permissions
 *   types · utilities · errors                     pure leaves
 *
 * This config scans CORE ONLY (`src/`). Cross-package isolation is enforced by
 * package `exports` boundaries, not this scan.
 *
 * The boot layer is the composition root and may import from any layer below it.
 *
 * The leaves (types/utilities/errors) are now pure and enforced by
 * `leaves-are-pure` — errors' entry-specific subclasses moved into entries/, and
 * the only remaining leaf→domain edges (config.ts's two contract types) are
 * type-only and carved out explicitly.
 *
 * Domains may read one another. The module split is for organisation, not
 * isolation: a reverse lookup that needs an entry's title and a user's name is
 * one clean call each, and forbidding it only pushed the same work somewhere
 * worse — a second wire shape for the same concept, resolved in the browser.
 * What the split defends against is functionality smeared across the codebase,
 * which no dependency rule can detect; `domain-no-upward` still holds the shape
 * that matters. The domains sit outside `no-circular` because they have
 * pre-existing internal cycles — worth bringing into scope once those are
 * cleaned up, since a cycle IS the entanglement worth catching.
 *
 * The former `plugins/runtime ↔ entries` entanglement is GONE: the runtime is a
 * pure capability again. It declares the slice of entries it needs as a port
 * (`plugins/runtime/entry-access.ts`, typed only from leaves) and the entries
 * domain injects the implementation at boot (`entries/plugin-access.ts`). This
 * is now enforced by `plugins-runtime-is-a-capability`, and plugins/runtime is
 * back inside the acyclic `no-circular` scope.
 *
 */
module.exports = {
    forbidden: [
        {
            name: 'domain-no-upward',
            comment:
                'A domain knows nothing about delivery or composition. It must not import routes, admin, a transport (which now houses the fetch client under transport/http/client), policies, boot, codegen, or a first-party plugin. Importing the plugins/runtime hook engine IS allowed — that is a capability the domain fires hooks through. `content` is included: it is a DOWNSTREAM domain (it orchestrates entries + a model provider), but it knows nothing about delivery either.',
            severity: 'error',
            from: { path: '^src/(entries|media|users|settings|content)/' },
            to: {
                path: '^src/(routes|admin|transport|policies|boot|codegen)/',
            },
        },
        {
            name: 'content-is-downstream-of-the-domains',
            comment:
                'content/ sits ABOVE entries/ in the DAG: it reads an entry, rewrites its text through a provider and writes it back, so importing entries/ is a legitimate edge. The half worth enforcing is the reverse one — a domain must never import content/, or the cycle is back. This is the ONE direction still policed between domain-ish modules: the peer siblings may read each other freely (see the header), but content is downstream of them, not beside them.',
            severity: 'error',
            from: { path: '^src/(entries|media|users|settings)/' },
            to: { path: '^src/content/' },
        },
        {
            name: 'capability-no-upward',
            comment:
                'Capabilities (storage, email, cron, request-context, fields, cloudflare) sit below the domains: they expose primitives, they do not orchestrate. They must not import a domain, an upper layer, or a first-party plugin.',
            severity: 'error',
            from: {
                path: '^src/(storage|email|cron|request-context|fields|permissions|cloudflare)/',
            },
            to: {
                path: '^src/(entries|media|users|settings|routes|admin|transport|policies|boot|codegen)/',
            },
        },
        {
            name: 'plugins-runtime-is-a-capability',
            comment:
                'The plugin runtime (hook engine + plugin context/registry) is a capability, not a domain consumer. It may use sibling capabilities (database/email/cron/fields/…) and pure leaves, but must NOT import a domain or an upper layer. The entries behaviour it needs (scoping, type qualification, per-type storage) comes through the entry-access PORT (plugins/runtime/entry-access.ts), injected by the entries domain at boot — never via a direct entries import.',
            severity: 'error',
            from: { path: '^src/plugins/runtime/' },
            to: {
                path: '^src/(entries|media|users|settings|routes|admin|transport|policies|boot|codegen)/',
            },
        },
        {
            name: 'database-no-upward-except-aggregate',
            comment:
                'The database capability must not import domains or upper layers — EXCEPT database/schema.ts, the table aggregator that re-exports each domain schema to keep the `astromech/db/schema` public surface intact (the public subpath stays `db/`; only the source dir is `database/`). Every other database/ file stays below the domains.',
            severity: 'error',
            from: { path: '^src/database/', pathNot: '^src/database/schema\\.ts$' },
            to: {
                path: '^src/(entries|media|users|settings|routes|admin|transport|policies|boot|codegen)/',
            },
        },
        {
            name: 'leaves-are-pure',
            comment:
                'The pure leaves (types, utilities, errors) sit at the very bottom of the DAG: they define contracts and helpers and may import ONLY other leaves (or third-party packages) — never a domain, a capability, or an upper layer. EXEMPT: the two public authoring contracts, types/config.ts (AstromechConfig — composes EntryStorage/ImageFormat) and types/plugins.ts (PluginDefinition — composes the Kysely DB and the TableDescriptor a plugin ships as its schema). Both compose at the TYPE level only, with no runtime coupling.',
            severity: 'error',
            from: {
                path: '^src/(types|utilities|errors)/',
                pathNot: '^src/types/(config|plugins)\\.ts$',
            },
            to: { path: '^src/(?!(types|utilities|errors)/)' },
        },
        {
            name: 'admin-only-client-and-pure-leaves',
            comment:
                'The admin SPA holds the Client and may use shared pure leaves (fields, types, utilities, errors). It must not reach into domains, capabilities, transports, policies, or boot — EXCEPT (a) the fetch Client at transport/http/client/, which the admin is built around, and (b) a short allowlist of pure domain leaves it renders with: entries/utils/url, entries/type-ids, entries/validation-stage (the browser runs the server pipeline before a submit and must pick the same stage the server will), settings/page-values, media/serving/image/url (URL string-building with zero imports — the admin thumb builds the same variant URL the server route parses, and a second copy could only drift). Those deep-imports avoid pulling a domain service (and its virtual:config) into the browser bundle.',
            severity: 'error',
            from: { path: '^src/admin/' },
            to: {
                path: '^src/(entries|media|users|settings)/|^src/(storage|email|cron|request-context|database|permissions|policies|transport|boot)/|^src/plugins/runtime/',
                pathNot:
                    '^src/entries/(utils/url|type-ids|validation-stage)\\.(ts|js)$|^src/settings/page-values\\.(ts|js)$|^src/media/serving/image/url\\.(ts|js)$|^src/transport/http/client/',
            },
        },
        {
            name: 'client-is-over-the-wire',
            comment:
                'The fetch Client (astromech/fetch) lives at transport/http/client/ but talks to the HTTP API over the wire — it is the client *half* of the http transport, not part of the server. It must not reach into domains, capabilities, policies, the rest of transport (the server), boot, or admin — only shared pure leaves (types/utilities/errors). Its own subtree is exempt so it may have internal imports.',
            severity: 'error',
            from: { path: '^src/transport/http/client/' },
            to: {
                path: '^src/(entries|media|users|settings|storage|email|cron|request-context|database|permissions|policies|transport|boot|admin)/',
                pathNot: '^src/transport/http/client/',
            },
        },
        {
            name: 'policies-no-upward',
            comment:
                'Policies wrap domain services with permission/confirmation logic. They must not import a transport (which houses the fetch client), admin, or boot.',
            severity: 'error',
            from: { path: '^src/policies/' },
            to: { path: '^src/(transport|admin|boot)/' },
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
            name: 'transport-no-reach-boot',
            comment:
                'The http/local/mcp transports and the shared tool surface are projected BY the boot layer and must not import it. transport/cli is exempt — it is a standalone entrypoint that performs its own config resolution + boot.',
            severity: 'error',
            from: { path: '^src/transport/(http|local|mcp|tools)/' },
            to: { path: '^src/boot/' },
        },
        {
            name: 'no-circular',
            comment:
                'Cyclic dependencies break the acyclic layer graph and tree-shaking. Scoped to the clean capability/delivery spine, now including plugins/runtime (its entries entanglement was untangled via the entry-access port). The four domains stay out of scope for now (their own internal cycles are a separate cleanup).',
            severity: 'warn',
            from: {
                path: '^src/(storage|email|cron|request-context|fields|permissions|database|policies|transport|boot|plugins/runtime)/',
            },
            to: { circular: true },
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
