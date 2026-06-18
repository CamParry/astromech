/**
 * Dependency-direction guardrail — modular (screaming-architecture) DAG.
 *
 * Imports may only point DOWN this list; upward edges are forbidden, and peer
 * domains may never import one another.
 *
 *   routes · admin · kernel · codegen · cli        entrypoints & composition root
 *   transport (http · local · mcp · cli)           delivery
 *     · http/client = the fetch Client (consumes the HTTP API over the wire;
 *       client half of the transport, nested but kept a distinct DAG node)
 *   policies                                       permission / confirmation wrappers
 *   plugins/{seo}                                  first-party plugins (in-tree)
 *   entries · media · users · settings             domains — siblings, never import each other
 *   plugins/runtime · database · storage · email ·  capabilities
 *     cron · context · fields · permissions
 *   types · utilities · errors                     pure leaves
 *
 * Sitting OUTSIDE this `src/` graph: packages/* — the first-party plugin packages
 * (`@astromech/{menus,…}`). They are downstream consumers of the published
 * `astromech` surface; `packages-only-public-surface` forbids them reaching any
 * `src/` internal beyond the public root + `src/exports/`.
 *
 * The kernel is the composition root and may import from any layer below it.
 *
 * The leaves (types/utilities/errors) are now pure and enforced by
 * `leaves-are-pure` — errors' entry-specific subclasses moved into entries/, and
 * the only remaining leaf→domain edges (config.ts's two contract types) are
 * type-only and carved out explicitly.
 *
 * KNOWN DEFERRED ENTANGLEMENT — a pre-existing edge that needs a code MOVE, not a
 * rule, so it is intentionally NOT enforced yet (tracked as a grab-bag drain):
 *   - plugins/runtime ↔ entries   (the plugin SDK wires the entries domain)
 * A strict "plugins-runtime-is-a-capability" rule is withheld until that move
 * lands, rather than encoding a carve-out that would ossify the smell.
 *
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-peer-imports',
      comment:
        'Domains are siblings in a DAG: entries/media/users/settings must never import one another. The ONLY exception is a schema.ts FK cross-reference (e.g. a createdBy column referencing usersTable) — schema files are excluded as sources. Everything else routes through the @/database/schema aggregate or a shared capability.',
      severity: 'error',
      from: { path: '^src/(entries|media|users|settings)/', pathNot: '/schema\\.ts$' },
      to: { path: '^src/(entries|media|users|settings)/', pathNot: '^src/$1/' },
    },
    {
      name: 'domain-no-upward',
      comment:
        'A domain knows nothing about delivery or composition. It must not import routes, admin, a transport (which now houses the fetch client under transport/http/client), policies, the kernel, codegen, or a first-party plugin. Importing the plugins/runtime hook engine IS allowed — that is a capability the domain fires hooks through.',
      severity: 'error',
      from: { path: '^src/(entries|media|users|settings)/' },
      to: {
        path: '^src/(routes|admin|transport|policies|kernel|codegen)/|^src/plugins/seo/',
      },
    },
    {
      name: 'capability-no-upward',
      comment:
        'Capabilities (storage, email, cron, context, fields) sit below the domains: they expose primitives, they do not orchestrate. They must not import a domain, an upper layer, or a first-party plugin.',
      severity: 'error',
      from: { path: '^src/(storage|email|cron|context|fields|permissions)/' },
      to: {
        path: '^src/(entries|media|users|settings|routes|admin|transport|policies|kernel|codegen)/|^src/plugins/seo/',
      },
    },
    {
      name: 'database-no-upward-except-aggregate',
      comment:
        'The database capability must not import domains or upper layers — EXCEPT database/schema.ts, the table aggregator that re-exports each domain schema to keep the `astromech/db/schema` public surface intact (the public subpath stays `db/`; only the source dir is `database/`). Every other database/ file stays below the domains.',
      severity: 'error',
      from: { path: '^src/database/', pathNot: '^src/database/schema\\.ts$' },
      to: {
        path: '^src/(entries|media|users|settings|routes|admin|transport|policies|kernel|codegen)/|^src/plugins/seo/',
      },
    },
    {
      name: 'leaves-are-pure',
      comment:
        'The pure leaves (types, utilities, errors) sit at the very bottom of the DAG: they define contracts and helpers and may import ONLY other leaves (or third-party packages) — never a domain, a capability, or an upper layer. EXEMPT: types/config.ts, the public AstromechConfig contract, which composes a couple of domain contract types (EntryStorage, ImageFormat) at the TYPE level only — no runtime coupling.',
      severity: 'error',
      from: { path: '^src/(types|utilities|errors)/', pathNot: '^src/types/config\\.ts$' },
      to: { path: '^src/(?!(types|utilities|errors)/)' },
    },
    {
      name: 'admin-only-client-and-pure-leaves',
      comment:
        'The admin SPA holds the Client and may use shared pure leaves (fields, types, utilities, errors). It must not reach into domains, capabilities, transports, policies, or the kernel — EXCEPT (a) the fetch Client at transport/http/client/, which the admin is built around, and (b) a short allowlist of pure domain leaves it renders with: entries/url, entries/type-registry, settings/page-values. Those deep-imports avoid pulling a domain service (and its virtual:config) into the browser bundle.',
      severity: 'error',
      from: { path: '^src/admin/' },
      to: {
        path: '^src/(entries|media|users|settings)/|^src/(storage|email|cron|context|database|permissions|policies|transport|kernel)/|^src/plugins/runtime/',
        pathNot:
          '^src/entries/(url|type-registry)\\.(ts|js)$|^src/settings/page-values\\.(ts|js)$|^src/transport/http/client/',
      },
    },
    {
      name: 'client-is-over-the-wire',
      comment:
        'The fetch Client (astromech/fetch) lives at transport/http/client/ but talks to the HTTP API over the wire — it is the client *half* of the http transport, not part of the server. It must not reach into domains, capabilities, policies, the rest of transport (the server), the kernel, or admin — only shared pure leaves (types/utilities/errors). Its own subtree is exempt so it may have internal imports.',
      severity: 'error',
      from: { path: '^src/transport/http/client/' },
      to: {
        path: '^src/(entries|media|users|settings|storage|email|cron|context|database|permissions|policies|transport|kernel|admin)/',
        pathNot: '^src/transport/http/client/',
      },
    },
    {
      name: 'policies-no-upward',
      comment:
        'Policies wrap domain services with permission/confirmation logic. They must not import a transport (which houses the fetch client), admin, or the kernel.',
      severity: 'error',
      from: { path: '^src/policies/' },
      to: { path: '^src/(transport|admin|kernel)/' },
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
      name: 'transport-no-reach-kernel',
      comment:
        'The http/local/mcp transports are projected BY the kernel and must not import it. transport/cli is exempt — it is a standalone entrypoint that performs its own config resolution + boot.',
      severity: 'error',
      from: { path: '^src/transport/(http|local|mcp)/' },
      to: { path: '^src/kernel/' },
    },
    {
      name: 'demo-scripts-no-src-internals',
      comment:
        'demo/ and scripts/ are package consumers: they import the published `astromech` surface (or the curated src/exports/ layer for drizzle schema paths), never raw src internals. The bare `astromech` self-reference (which the resolver maps into the source tree) stays allowed; relative `../src/...` drilling does not.',
      severity: 'error',
      from: { path: '^(demo|scripts)/' },
      to: { path: '^src/(?!exports/)' },
    },
    {
      name: 'packages-only-public-surface',
      comment:
        'The first-party plugin packages (packages/*) are downstream consumers of the published `astromech` surface — exactly like a third-party plugin. They import the bare `astromech` root (resolved to src/index.ts) and its public subpaths (resolved into src/exports/), plus third-party deps — and must NEVER reach a src/ internal (`@/…`) or another package`s source. Keeps the public API honest: if a package needs an internal, it gets promoted to the public surface (e.g. astromech/plugin-kit) first.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^src/', pathNot: '^src/(index\\.ts$|exports/)' },
    },
    {
      name: 'no-circular',
      comment:
        'Cyclic dependencies break the acyclic layer graph and tree-shaking. Scoped to the clean capability/delivery spine; domains and plugins/runtime are excluded until the known plugins/runtime↔entries entanglement is untangled.',
      severity: 'warn',
      from: {
        path: '^src/(storage|email|cron|context|fields|permissions|database|policies|transport|kernel)/',
      },
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.ts$|/test/|^packages/[^/]+/dist/)' },
    enhancedResolveOptions: {
      // Imports are written with `.js` extensions but resolve to `.ts` sources;
      // dependency-cruiser maps these via the tsConfig + the extension list below.
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
