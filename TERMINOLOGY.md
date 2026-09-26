# Astromech Terminology

What each word means here: definitions only, with no file paths, signatures or
rationale. Why a term beat its alternatives is in `DECISIONS.md`; where the code
lives is in `ARCHITECTURE.md`.

**Adapter.** Code that reshapes one internal interface into another. Distinct
from a driver, which reaches an external system.

**Admin page.** A routed admin destination rendering a React component, built
in or from a plugin. A field-bearing destination is a global instead.

**Admin resource.** A plugin's declaration of list, create and edit screens
over its own service methods, each view optional. Bare "resource" means an
entry, a global, a media item or a user, never this.

**Admin slot.** A named mount point for admin UI that is always present, outside
any one page.

**AI context.** What an admin screen declares about the thing the user is looking
at, so a model can resolve "this page" or "this field". Unqualified "context"
means React's.

**App context.** What a service method's handler is handed: the caller (user and
role), the site config, the content services bound to that caller, and handles
on the database, environment, email, hooks and the other service methods. It is
passed as an argument, never read from ambient state.

**Application.** The booted runtime a process holds. There is exactly one, and
creating it and reading it back are separate calls.

**Approval.** A mutating call held server-side for a human to answer later. The
stored arguments run, not whatever the caller sends back.

**Capability.** A feature a thing declares support for, such as an entry type's
statuses, translation, versioning, trash and staging, or a database driver's
optional extras. It gates behaviour, never schema, so turning one on needs no
migration.

**Component kit.** The config-free React components and hooks a plugin builds
admin UI from, imported as `astromech/ui`; it loads in plain Node. What needs the
running admin is imported as `astromech/ui/app`.

**Confirmation.** A stateless brake: a mutating call is turned back with a
question for a human, and the caller re-issues it with the answer. It slows a
runaway agent and is not a security boundary.

**Content.** One locale of a resource's authored values: its fields and the
content-level identifiers that go with them (an entry's title and slug, a media
item's title, alt text and caption). A content row's own id is never public; a
caller addresses content by the resource's id plus a locale.

**Driver.** A pluggable backend the site config names and core calls through a
fixed interface: database, storage, email, image transform, scheduler. Each is a
factory function, never a class or a shared singleton. Not "adapter".

**Encoded.** The form a value takes in a database column, as opposed to its JS
form: a `Date` as an ISO string, an object as JSON, a boolean as `0`/`1`. The
column's declared SQL type is its `columnType`. Not "storage", which is blobs.

**Entry.** One content item, with one id shared by all its locales. Not "record".

**Entry type.** A named kind of entry, declared in the site config or by a
plugin with its fields, slug rules, admin columns and capabilities. Its id is
its key for the site's, `<namespace>/<type>` for a plugin's.

**Field.** One authored input on a resource: a name, a type, and that type's
options.

**Field path.** The address of a value in a resource's field data. A schema path
addresses a field definition, with item selectors empty; an instance path
addresses one value, selecting repeated items by id.

**Field type.** The behaviour behind a field's type name, core or from a plugin:
how it coerces, validates, types and publishes its value, which fields it nests,
and whether it stores anything at all.

**Global.** One editor-owned item with no list, existing because the site config
or a plugin declares it by `key`. It carries fields, locales, statuses, versions
and staged changes as an entry does, and is addressed by its key plus a locale.
Not "single type" or "settings".

**Integration.** The glue that lets one host serve an application, with no
business logic. A **framework integration** (Astro) decides how a request arrives
and where the config lives; a **runtime integration** (Cloudflare) decides where
environment values come from and whether the host has a non-HTTP entry point.
Not "adapter", which Astro uses for deploy targets.

**Layout field.** A structural field with no name: an unnamed group, an
accordion, a tab, or tabs. It stores nothing, so the fields under it store in its
parent's data. Giving the same field a name makes it a nested field.

**Media item.** One uploaded file and what editors say about it. The file is
shared across locales; the title, alt text, caption and fields are content, per
locale. A media item has no status, staged change or trash.

**Merge tag.** A `{{token}}` in a form email, replaced by a submitted value. Not
"placeholder", which is a field's input hint.

**Method manifest.** The catalogue of service methods every transport dispatches
through.

**Module.** A directory owning one thing inside the core package. The five that
own content verbs (entries, globals, media, users, notifications) are
the content modules; `content` is the shared module four of them build on.
Modules call each other, so they are not "domains".

**Nested field.** A field that owns one data key and nests its children's values
under it: named groups, repeaters, blocks, trees. A field that is neither nested
nor layout is a leaf, holding one value.

**Permission.** The vocabulary of what may be done to what. "Access" means this
and nothing else. A policy is what applies it.

**Plugin, plugin context.** A plugin is a separate package that extends a site.
Its code runs with the plugin context: the app context plus the plugin's own
identity, a storage handle prefixed to the plugin, other plugins' service
methods, and a restricted view of the site config.

**Plugin helper.** A function a site calls off a plugin's factory in its config,
such as `seo.section()`, with the plugin's identity already applied.

**Policy.** Code that answers what an actor may do, not how a request reaches it.
Not "guard", which means a per-request route interceptor.

**Preview token.** A secret that authorizes reading unpublished or staged content
on its normal public route. It never widens what the response contains.

**Relationship.** A link from one resource to another, authored as a field and
recorded in a derived index. One index row is one reference: one id a relation
field holds, from the source (the resource holding the field) to the target.
Field data is the source of truth; the index is rebuildable from it and read only
for reverse lookups, filtering and deletion.

**Repository.** The database-access unit: reads and writes over one table. Not
"storage", "store" or "persistence".

**Request scope.** The per-request store an HTTP transport opens: the `Request`
and the identity resolved from it. Transport plumbing only; code below a
transport takes an app context instead. Named like the transaction scope. Not
"request context", which reads as the app context.

**Resource.** An entry, a global, a media item or a user: the four things that
carry fields and run the field pipeline. Not "record" or "document". In code,
the internal model of one is also a resource (`EntryResource`, `GlobalResource`,
`MediaResource`, `UserResource`, on the base `Resource`): the resource row
joined with one locale's content row, plus the locales that have one. Its
version rows are not part of it. The repository's decoder builds it
(`toUserResource`), and the public type keeps the plain name (`User`). Not
`UserRow`, `StoredUser`, `UserEntity`, `UserInstance` or `UserInternal`, and
not `UserOutput` or `PublicUser` for the public type.

**Schema.** Request validation, or a whole-shape aggregate. Never the table
declarations, which are tables. A method's output schema is the public shape of
what it returns (`userSchema`, in the resource's `schema.ts`): parsing the
handler's result through it strips the resource's internal keys, and the public
type is inferred from it (`User`).

**Service, method, client, API.** One noun per role. A service is a module's or
plugin's callable operations. A method (service method) is one of them: its
access rule, input and output schemas, effect hints and handler, declared once
and read by every transport. A client is an assembled consumer object such as
`astromechClient`. API means the HTTP surface only.

**Staged change.** A prepared future change to one locale of a live entry or
global, edited and previewed on its own and merged deliberately. It shares the
item's id, so a read asks for it rather than naming another id. Separate from a
version.

**Storage.** File and blob storage only. Never database access (a repository),
and never a value's column form (encoded).

**Table.** A declared database table and its row types. Migrations are generated
by diffing the declarations. A row is one row of one table (a resource row, a
content row, a version row) and nothing else: a joined read is a resource.

**Tool definition.** A manifest method projected into something a model may call,
with its description, input schema and confirmation wording.

**Trash.** Soft delete, reversed by restoring. Deleting is permanent and separate;
there is no force-delete.

**User.** An admin account. Email, name and role belong to the account
better-auth owns; the site's own fields are content, per locale. A user has no
status, staged change or trash.

**Validation mode.** Completeness (is the field filled in) or correctness (is its
value valid). A draft is checked for correctness only, so it saves half-finished
but never malformed.

**Version.** An append-only snapshot of one content row as it was, listed per
resource and locale. Separate from a staged change.
