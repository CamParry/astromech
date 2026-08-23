# 0058 — One name for the publish timestamp: `publishedAt` on the way in and on the way out

**Date:** 2026-08-17
**Status:** accepted

The `publishAt` input alias is removed; `publishedAt` is the name at every layer (params, Zod, CLI, HTTP, admin, row, hooks), matching Ghost/Strapi/Contentful, with UI copy "Publish date". Rejected `publishDate`/`postDate` and keeping the documented alias.
