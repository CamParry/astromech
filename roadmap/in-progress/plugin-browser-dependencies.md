# Plugin browser dependencies

A plugin's admin components import packages the site's Vite pre-bundles only
when it finds them. Nothing lists them, so the dev server finds them late and
reloads the page.

## What happens today

The admin's packages are listed: `packages/admin/src/vite.ts` files every bare
specifier its `src` imports, and core renders them into `optimizeDeps.include`
as `astromech > @astromech/admin > <name>`. A test fails when one is missing.

Plugins have no such list. The assistant's
`packages/plugins/assistant/src/admin/slots/chat-drawer.tsx` imports
`react-markdown` and `remark-gfm`, and every `astro dev` run prints
`new dependencies optimized: react-markdown, remark-gfm` and reloads. In a site
installed from npm it is worse: the plugin's components sit in `node_modules`,
where Vite's scanner does not look, and under pnpm the packages do not resolve
from the site root at all.

## Options

- **The plugin definition declares its browser packages**, the way the admin
  does, and core renders them as `<plugin package> > <name>`. Needs the
  plugin's package name, which a definition does not carry today.
- **Core derives the list** from the component files a plugin names, by
  reading their imports at config time. No declaration to keep in step, but
  core parses plugin source.
- **Accept the reload** and document it. It costs one reload per new package
  per dev cache.

## The work

- [x] Choose between the options above. A plugin declares
      `admin.optimizeDeps.include`, Vite's own name, as bare specifiers, and
      core renders each as `<package> > <name>` from the definition's
      `package`, or bare for a plugin with a `file:` root, which resolves from
      the site. It matches the admin's list and stays explicit. Rejected:
      deriving the list, which has core parse plugin source at config time,
      and accepting the reload.
- [ ] Apply it to the assistant, and add a check like the admin's that fails
      when a component imports a package the list misses.
