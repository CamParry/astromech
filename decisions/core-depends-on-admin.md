---
area: structure
---

# Core depends on the admin package

`astromech/astro` injects `@astromech/admin` into every site, so a site installs core alone, as with Strapi and Directus. The admin ships as source because a site's admin components join its build.

**Rejected:** installing the admin beside core (Payload); an `@admin/*` alias the site's Vite must also register.
