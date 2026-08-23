# 0052 — The gate executes the admin in a browser

**Date:** 2026-08-15
**Status:** accepted

`check-boot.mjs` loads `/admin` in headless chromium via Playwright and asserts `#am-app form input[type="password"]` painted; mandatory, not flagged, and stops before login. Rejected puppeteer-core with system Chrome, a bare CDP probe, and a console-error allowlist (argument-less browser resource errors are ignored instead).
