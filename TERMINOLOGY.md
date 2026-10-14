# Astromech Terminology

What each word means in this codebase. Why a term won is in `DECISIONS.md`.

**Access.** The rule a service method or a plugin's raw route declares for who
may call it (an `AccessRule`: `'public'`, `'authenticated'`, a permission, or a
function of the call's input and its caller (`{ user, role }`) naming the
permissions it needs), and the check of
a caller against that rule (`allowsAccess`). `media.access` is a different thing: how media is
delivered.

**Action.** The verb a permission ends with: `read`, `create`, `update`,
`delete`, `publish`, and a few of a resource's own (`media:upload`,
`security:manage`, `admin:access`). Each resource's `permissions.ts` lists its
own (`ENTRY_ACTIONS`, `GLOBAL_ACTIONS`, `MEDIA_ACTIONS`, `USER_ACTIONS`,
`SECURITY_ACTIONS`), and the admin checks one with `can(action)`. A CAPTCHA action (`CAPTCHA_ACTIONS`) is a different
thing: the operation a CAPTCHA token is issued for.

**Adapter.** Code that reshapes one internal interface into another. A driver
reaches an external system instead.

**Admin page.** A routed admin destination rendering a React component, built in
or from a plugin. A destination with fields is a global instead.

**Admin resource.** A plugin's list, create and edit screens over its own service
methods. Bare "resource" never means this.

**Admin slot.** A named mount point for admin UI that is present outside any one
page.

**AI context.** What an admin screen declares about what the user is looking at,
so a model can resolve "this page". Bare "context" means React's.

**App context.** What a method handler receives as an argument: the caller (user
and role), the config, the services bound to that caller, and handles on the
database, environment, email, hooks and other methods.

**Application.** The booted runtime a process holds; there is one. Creating it
and reading it are separate calls.

**Approval.** A mutating call held server-side for a human to answer. The stored
arguments run, not what the caller sends back.

**Capability.** A feature a thing declares support for (an entry type's statuses,
translation, versioning, trash, staging; a driver's optional extras). It gates
behaviour, never schema.

**Component kit.** The config-free React components and hooks plugins build admin
UI from (`astromech/ui`). What needs the running admin is `astromech/ui/app`.

**Confirmation.** A stateless brake: a mutating call is turned back with a
question, and the caller re-issues it with the answer. Not a security boundary.

**Content.** One locale of a resource's authored values: its fields plus
identifiers such as an entry's title and slug. Addressed by resource id and locale;
a content row's own id is never public.

**Driver.** A pluggable backend the config names and core calls through a fixed
interface: database, storage, email, image transform, scheduler. A factory
function, never a class or a singleton.

**Encoded.** A value's form in a database column (a `Date` as an ISO string, an
object as JSON), as opposed to its JS form.

**Entry.** One content item, with one id shared by all its locales.

**Entry type.** A named kind of entry declared by the site or a plugin. Its id is
`<type>` for the site's, `<namespace>/<type>` for a plugin's.

**Field, field type.** A field is one authored input: a name, a type, and options.
A field type is the behaviour behind a type name: coerce, validate, type, publish,
nest.

**Field path.** The address of a value in field data. A schema path addresses a
definition; an instance path addresses one value, selecting items by id.

**Global.** One editor-owned item with no list, declared by `key` in the config or
a plugin. It has fields, locales, statuses, versions and staged changes like an
entry.

**Integration.** Glue that lets one host serve the application. A framework
integration (Astro) handles requests and config; a runtime integration
(Cloudflare) handles environment and non-HTTP entry points. Astro's "adapter" is a
deploy target, not this.

**Layout field.** An unnamed structural field (group, accordion, tab, tabs). It
stores nothing; its children store in the parent's data.

**Media item.** One uploaded file, shared across locales, plus per-locale title,
alt text, caption and fields. No status, staged change or trash.

**Merge tag.** A `{{token}}` in a form email, replaced by a submitted value.
"Placeholder" is a field's input hint.

**Method manifest.** The catalogue of service methods every transport dispatches
through. Each method records its access in one shape, whatever its source: the
rule's kind (`access`), the permissions a call needs (`permissions`), and
whether only the call's input can name them (`dynamic`).

**Module.** A directory owning one thing in core. Entries, globals, media, users
and notifications are the content modules; `content` is what four of them share.

**Nested field.** A field that owns one data key and nests its children under it:
named groups, repeaters, blocks, trees. A field neither nested nor layout is a leaf.

**Permission.** A string a role grants, `<kind>[:<id>]:<action>`:
`entry:post:publish`, `global:site:read`, `media:upload`, `plugin:seo:read`.
`*` alone grants everything, a `*` segment matches one segment, and a trailing
`*` matches the rest. `hasPermission` is the bare matcher; on the server
`permissionsFor(role).allows` checks one. Core's sit beside each resource, in
its `permissions.ts`, with `admin:access` in `permissions/core-permissions.ts`.
Entry and global permissions are derived from the config; a plugin declares its
own with `definePermissions`.

**Plugin, plugin context.** A plugin is a separate package that extends a site.
Its plugin context is the app context plus its identity, prefixed storage, other
plugins' methods and a restricted config view.

**Plugin helper.** A function a site calls off a plugin's factory in its config
(`seo.section()`), with the plugin's identity applied.

**Policy.** Not an authorisation term here: say permission, role or access.
Laravel, Strapi and Directus each mean a different thing by it, and the
`policies/` directory is none of them.

**Preview token.** A secret that lets a public route show unpublished or staged
content. It never widens what the response contains.

**Public.** One audience, anonymous visitors, in two uses: what they may call
(`access: 'public'`, which needs no role or permission; a
`public: true` global's plain read needs no permission) and what they see (the
`public` read shape, which removes private fields). The shape decides which
fields a read returns, not which rows: a preview returns unpublished or staged
content in the public shape. `media.access: 'public'` is a delivery mode, not
this.

**Relationship.** A link from one resource (the source) to another (the target),
authored as a field. Field data is the truth; a rebuildable index holds one row per
referenced id, for reverse lookups, filtering and deletion.

**Repository.** Database reads and writes over one table.

**Request scope.** The per-request store an HTTP transport opens: the `Request`
and the identity resolved from it. Code below a transport takes an app context.

**Resource.** An entry, a global, a media item or a user: the four that carry
fields. In code, `UserResource` and its siblings are the resource row joined with
one locale's content row, plus the locales that have one; the public type keeps
the plain name (`User`).

**Resource type.** Which of the four a resource is (`'entry'`, `'global'`,
`'user'` or `'media'`). Each has one resource config that the shared content
helpers read. Code that holds one names it `type`. An entry's type or a
global's key, named beside it, is its **subtype** (`sourceSubtype` in the
relationships index); users and media have none.

**Role.** Who holds permissions: a slug, a name and a list of permissions. A
user has one. The built-in `admin` (`*`) and `editor` merge with the config's
`roles`, which may replace them. A caller with no role holds nothing.

**Schema.** Request validation or a whole-shape aggregate, never table
declarations. A method's output schema is the public shape it returns.

**Snapshot.** What a version holds: the public keys a version stores (`fields`,
plus title and slug or media text). Never the whole resource.

**Staged change.** A prepared future change to one locale of a live entry or
global, previewed alone and merged deliberately. It shares the item's id.

**Storage.** File and blob storage only. Never database access or a column's form.

**Table.** A declared database table and its row types; migrations come from
diffing them. A row is one row of one table; a joined read is a resource.

**Tool definition.** A manifest method projected into something a model may call,
with its description, input schema and confirmation wording.

**Trash.** Soft delete, undone by restoring. Deleting is permanent and separate.

**User.** An admin account. Email, name and role belong to better-auth's account;
the site's own fields are per-locale content. No status, staged change or trash.

**Validation mode.** Completeness (is it filled in) or correctness (is it valid). A
draft is checked for correctness only.

**Version.** An append-only snapshot of one content row, numbered from 1 per
resource and locale and addressed by resource id (or global key), locale and
number; its row id is internal. Separate from a staged change.
