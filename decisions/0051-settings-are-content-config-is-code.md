# 0051 — Settings are content, config is code, and there is no core settings page

**Date:** 2026-08-15
**Status:** accepted

Code-first split: runtime config and secrets in `astromech.config.ts`/`.env`, editor-owned site-wide values as `defineAdminPage` settings-table content; no core settings page (the `/admin/settings` placeholder is deleted). Rejected a WordPress-style General Settings page and admin-editable secrets.
