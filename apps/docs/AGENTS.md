# apps/docs

User-facing documentation: someone building a site with Astromech, not someone working on it. Root `AGENTS.md` applies; the `docs` skill has the writing contract.

- **Write for a consumer of the published packages.** Internal layering, the import DAG, and repo workflow belong in `ARCHITECTURE.md` and `AGENTS.md`, never here.
- **One page, one shape.** A page is a how-to (accomplish a task), a reference (look a value up), or an explanation (understand why it works this way). A page that starts explaining halfway through a how-to should link instead.
- **Every page is listed in `README.md`** with a one-line summary of what it covers. That index is how a reader and an agent find the page without opening all of them.
- **Show the current API.** No migration notes, no "previously this was called", no changelog. Rationale links to `DECISIONS.md`.
