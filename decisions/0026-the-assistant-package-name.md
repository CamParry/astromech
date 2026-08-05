# 0026 — `@astromech/assistant`

**Date:** 2026-08-06
**Status:** accepted

`@astromech/authoring` is now `@astromech/assistant`. The export is `assistant`,
`AuthoringOptions` is `AssistantOptions`, and the tables it owns are
`plugin_assistant_approvals` and `plugin_assistant_sessions`.

## Why the old name stopped fitting

"Authoring" described what the package was going to be, not what it is. What it
is is a chat drawer: a topbar button, a panel, a streaming route, and a loop
that calls the site's own service methods on the signed-in user's behalf.

Three things made the old name wrong rather than merely vague. Its own slot
component was already called `assistant-button.tsx` and its header already said
"assistant", so the package name disagreed with the code inside it. Its reach is
the whole method manifest, so it can manage users and settings, which is not
authoring by any reading. And the model seam moving to core
(`decisions/0021-ai-as-an-optional-core-capability.md`) took the last part of it
that had anything to do with producing content.

"Assistant" is the ordinary word for this thing, it needs no explaining, and a
reader who has never seen this repo guesses what the package does from the name.

## What the name had to avoid

The rename was not a free choice of any better word, because **"authoring" is
load-bearing vocabulary elsewhere in this repo.** It means _plugin authoring_ —
the practice of writing a plugin — and `apps/docs/plugins/authoring.md` is the
guide to doing it, with `roadmap/completed/plugin-authoring-experience.md`
behind it.

So the package was competing for a word already in use for something else, which
is the collision `AGENTS.md`'s naming rules are about. Only the package renamed.
Every other "authoring" in the repo kept its meaning, and the guide keeps its
filename.

## The tables came with it

`definePluginTable` derives table names from the package, so the rename was not
cosmetic: `plugin_authoring_approvals` and `plugin_authoring_sessions` became
`plugin_assistant_*`.

Nothing is deployed anywhere, so the two existing migrations were collapsed into
one regenerated baseline rather than shipping a rename migration. A rename
migration exists to protect data in a database somebody is running, and there is
no such database. Writing one would have added a permanent step to every fresh
install to preserve rows that do not exist.
