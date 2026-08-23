# Astromech — Terminology

What each word means here. Definitions only: no file paths, no signatures, and no
rationale. Why a term beat its alternatives is in `decisions/`; where the code
lives is in `ARCHITECTURE.md`.

**Adapter.** Code that reshapes one internal interface into another. Distinct
from a driver, which reaches an external system.

**Admin page.** A routed destination in the admin app, built in or contributed by
a plugin.

**Admin slot.** A named mount point for persistent chrome that lives outside any
one page. A page is somewhere you navigate to, a slot is always present.

**AI context.** What an admin screen declares about the thing the user is looking
at, so a model can resolve "this page" or "this field". The prefix is
load-bearing: unqualified "context" here means React's.

**Application.** The booted runtime a process holds. There is exactly one, and
creating it and reading it back are separate calls.

**Approval.** A mutating call held server-side for a human to answer later. What
eventually runs are the stored arguments, not whatever the caller sends back.

**Capability.** A feature a thing declares support for: an entry type's statuses,
slug, translation, versioning, trash and staging, or a database driver's optional
extras. It gates behaviour and interface, never schema, so turning one on needs
no migration.

**Confirmation.** A stateless brake: a mutating call is turned back with the
question to put to a human, and the caller re-issues it carrying the answer. It
buys one turn against a runaway agent and is not a security boundary.

**Driver.** A pluggable backend the site config names and core calls through a
fixed interface: database, storage, email, image transform, scheduler. Each is a
factory function, never a class or a shared singleton.

**Encoded.** The form a value takes in a database column, as opposed to its JS
form: a `Date` as an ISO string, an object as JSON, a boolean as `0`/`1`.
`database/codec.ts` converts between the two. Not "storage", which is blobs.

**Entry.** One content item. Not "record", which conflates content with database
rows.

**Entry type.** A named kind of entry, declared in the site config with its
fields, slug rules, admin columns and capabilities.

**Field.** One authored input on a resource: a name, a type, and that type's
options.

**Field path.** The address of a value inside a resource's field data. It has two
renderings: the schema path addresses a field definition, with item selectors
left empty, and the instance path addresses one item's own value, selecting
repeated items by id.

**Field type.** The behaviour behind a field's type name: how it builds, coerces,
validates, and types itself in a site.

**Integration.** The glue that lets one host serve an application, carrying no
business logic. Two kinds: a **framework integration** (Astro) answers how a
request arrives and where the config lives; a **runtime integration**
(Cloudflare) answers where environment values come from and whether the host has
an entry point that is not an HTTP request. Not "adapter", which Astro already
uses for its deploy targets.

**Layout field.** A field that draws structure and stores nothing: sections,
tabs, accordions. Its own name never appears in a data path, so data stays flat
underneath it.

**Method manifest.** The catalogue of callable service methods that every
transport dispatches through, rather than each one knowing the services directly.

**Module.** A directory owning one thing inside the core package. The five that
own content verbs (entries, media, users, settings, notifications) are the
content modules. Modules keep to their boundaries but do call each other, so they
are not "domains" in the bounded-context sense.

**Mount.** Which package an entry type comes from: the site itself, or a
plugin. It decides the type's permission namespace and where the admin serves it,
and is never the identifier a caller passes.

**Nested field.** A field that owns one data key and nests its children's values
under it: groups, repeaters, blocks, trees. Everything that is neither nested nor
layout is a leaf, holding one value.

**Permission.** The vocabulary of what may be done to what. A policy is what
applies it.

**Plugin.** A separate package that extends a site through tables, routes,
service methods, hooks, scheduled jobs and admin pages.

**Plugin context.** Everything a plugin is handed at runtime: the content
services, the current user, and narrowed handles on the backends. A handle is
deliberately smaller than the driver behind it. Its members have no collective
name beyond the context itself.

**Policy.** Code that answers what an actor may do, not how a request reaches it.
Not a "guard", which elsewhere means a per-request route interceptor.

**Preview token.** A secret that authorizes reading unpublished or staged content
on its normal public route. It authorizes only, and never widens what the
response contains.

**Relationship.** A link from one resource to another, authored as a field and
recorded as an edge in a derived index. Field data is the source of truth, and
the index is rebuildable from it and read only for reverse lookups, filtering and
deletion.

**Repository.** The database-access unit: reads and writes over one table.
Distinct from storage.

**Resource.** The superordinate noun for the four things that carry fields and
run the field pipeline: an entry, a media item, a user, and a settings page.
Chosen over "record" and "document".

**Schema.** Request validation, or a whole-shape aggregate. Never the table
declarations themselves, which are tables.

**Staged entry.** A prepared future change to a live entry, edited and previewed
on its own and merged deliberately. Forward-looking, and separate from a version.

**Storage.** File and blob storage only. Never database access, and never the
column form of a value, which is **Encoded**.

**Table.** A declared database table and the row types that come with it. Core
and plugins both declare them, and migrations are generated by diffing the
declarations.

**Table-backed type.** A plugin's own table presented through the entries admin
surface with all entry chrome switched off. It shares the interface with entries
and none of the internals.

**Tool definition.** One manifest method projected into something a model may
call, with the description, input schema and confirmation wording it needs.

**Trash.** Soft delete: the item is marked and kept, and restoring reverses it.
Deleting is permanent and separate; there is no force-delete.

**Validation mode.** The split between completeness (has the field been filled
in) and correctness (is what it holds valid). A draft is checked for correctness
only, so it can save half-finished without storing something malformed.

**Version.** An append-only snapshot of an entry as it was. Backward-looking, and
separate from a staged entry.
