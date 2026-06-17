// transport — projections of service methods into a consumption shape per consumer:
// local · http · cli · mcp. Composes services + policies; never imported by them.
// "transport" is the internal umbrella; public names are per-transport (Local API,
// HTTP API, CLI, MCP server). See specs/services-architecture.md §2.
//
// Barrel stub (Stage 0 scaffold). Populated in Stage 2 (local) + Stage 3 (http, cli).
export {};
