---
milestone: 1.0
---

# `create-astromech`

Starting a site takes the eight steps in `apps/docs/installation.md`: nine
packages, the Astro config, the Astromech config, environment variables and
migrations. Raised on 2026-10-04; decided 2026-10-05.

## Prior art

- **`create-astro`:** `npm create astro@latest`, a template (`--template`),
  installs dependencies, initialises git; each question has a flag.
- **`create-payload-app`** and **`create-strapi-app`:** a template and a
  database choice, then a running project.
- All keep their templates in their own repo and test them.

## Decided (2026-10-05)

- **A separate package, `create-astromech`,** run with
  `npm create astromech@latest`. Rejected: `astromech new`, since the CLI is
  not installed until a site exists.
- **Questions, each with a flag:** the directory, the runtime (Node with a
  libSQL file, or Cloudflare Workers with D1) and the template (a blank site,
  or a starter with a few entry types and pages). With no terminal it uses the
  flags and the defaults.
- **It finishes with a running setup:** dependencies installed, a generated
  `BETTER_AUTH_SECRET` in `.env`, `db:migrate` run on Node, and git
  initialised. The first admin is created in the browser by first-run setup
  (`roadmap/completed/first-run-setup.md`). It refuses a non-empty directory.
- **Templates are files in this repo,** and CI creates a site from each
  template on each runtime, then boots it, as `check:install` does for a
  packed install.
- **An existing Astro site** keeps following `apps/docs/installation.md`.

## The work

- [ ] `packages/create-astromech`: the questions, flags and defaults.
- [ ] The blank and starter templates, for Node and Cloudflare.
- [ ] Install, the secret, `db:migrate`, git.
- [ ] CI: create, install packed tarballs and boot each template and runtime.
- [ ] `apps/docs`: a "Create a site" page ahead of the installation guide.

## Testing

Each template on each runtime creates, installs and boots to first-run setup;
a non-empty directory is refused; every question can be answered by a flag;
the generated secret passes the site-health check.
