/**
 * Dependency-direction guardrail for the services/transport layer model.
 * Source of truth: specs/services-architecture.md §3 (the dependency-direction invariant).
 *
 *   storage → services → policies → transport → Client      (all assembled at the kernel)
 *
 * Only UPWARD edges are forbidden — downward edges (a transport calling a service,
 * a service calling storage) are the whole point and stay allowed. The kernel is the
 * composition root and may import from any layer.
 *
 * NOTE: this guardrail lands in Stage 0, before the code moves. The target layer dirs
 * are empty barrel stubs until Stages 1–5 populate them, so the rules are vacuously
 * satisfied today and begin biting as code arrives. Legacy dirs (core/, sdk/, api/)
 * are intentionally ungoverned — they are dissolved by the refactor, and the temporary
 * re-export barrels live there transitionally (torn down in Stage 7).
 */
module.exports = {
  forbidden: [
    {
      name: 'storage-no-upward',
      comment:
        'storage is the bottom layer: it knows data, not rules. It must not import services, policies, transports, the client, the kernel, or admin.',
      severity: 'error',
      from: { path: '^src/storage/' },
      to: { path: '^src/(services|policies|transport|client|kernel|admin)/' },
    },
    {
      name: 'services-no-reach-for-transport',
      comment:
        'A service method is a bare function unaware of delivery shape. It must not import a transport, the client, the kernel, or admin.',
      severity: 'error',
      from: { path: '^src/services/' },
      to: { path: '^src/(transport|client|kernel|admin)/' },
    },
    {
      name: 'services-no-import-policies',
      comment:
        'Policies (permissions, confirmation) are COMPOSED ONTO services by the kernel/transport — services must not import them. Visibility is NOT a policy: it is per-feature, data-model-specific read-shaping that lives beside its service (services/<feature>/visibility.ts), so it does not appear here.',
      severity: 'error',
      from: { path: '^src/services/' },
      to: { path: '^src/policies/' },
    },
    {
      name: 'policies-no-upward',
      comment:
        'Policies wrap services. They must not import a transport, the client, the kernel, or admin.',
      severity: 'error',
      from: { path: '^src/policies/' },
      to: { path: '^src/(transport|client|kernel|admin)/' },
    },
    {
      name: 'transport-no-reach-client-or-admin',
      comment:
        'Transports compose services + policies. No transport may import the client or admin (those are downstream consumers).',
      severity: 'error',
      from: { path: '^src/transport/' },
      to: { path: '^src/(client|admin)/' },
    },
    {
      name: 'transport-no-reach-kernel',
      comment:
        'The HTTP/Local/MCP transports are projected BY the kernel and must not import it. The CLI is exempt: it is a standalone entrypoint (the outermost "delivery mechanism" ring) that performs its own config resolution + boot, so transport/cli may reach the kernel.',
      severity: 'error',
      from: { path: '^src/transport/(http|local|mcp)/' },
      to: { path: '^src/kernel/' },
    },
    {
      name: 'client-is-over-the-wire',
      comment:
        'The Client consumes the HTTP API over the wire. It must not reach into storage, services, policies, other transports, the kernel, or admin — only shared support/types/errors.',
      severity: 'error',
      from: { path: '^src/client/' },
      to: { path: '^src/(storage|services|policies|transport|kernel|admin)/' },
    },
    {
      name: 'admin-talks-only-to-client',
      comment:
        'The admin SPA is a transport-consumer that holds the Client. It must not reach past it into storage, services, policies, other transports, or the kernel.',
      severity: 'error',
      from: { path: '^src/admin/' },
      to: { path: '^src/(storage|services|policies|transport|kernel)/' },
    },
    {
      name: 'demo-scripts-no-src-internals',
      comment:
        'demo/ and scripts/ are package consumers: they import the published `astromech` surface (or the curated src/exports/ layer for drizzle schema paths), never raw src internals. Scoped to `local` deps so it catches relative `../src/...` drilling — the in-repo reach Node\'s exports map cannot — while the bare `astromech` self-reference (which the resolver maps into the source tree) stays allowed.',
      severity: 'error',
      from: { path: '^(demo|scripts)/' },
      to: { path: '^src/(?!exports/)' },
    },
    {
      name: 'no-circular',
      comment:
        'Cyclic dependencies make the layer graph non-acyclic and break tree-shaking. Scoped to the new layer dirs so legacy core/sdk cycles do not block the spine refactor.',
      severity: 'warn',
      from: { path: '^src/(storage|services|policies|transport|client|kernel)/' },
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.ts$|/test/)' },
    enhancedResolveOptions: {
      // Imports are written with `.js` extensions but resolve to `.ts` sources;
      // dependency-cruiser maps these via the tsConfig + the extension list below.
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
