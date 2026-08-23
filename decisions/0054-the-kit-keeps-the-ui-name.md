# 0054 — The component kit keeps the `astromech/ui` name, and the app surface becomes `astromech/ui/app`

**Date:** 2026-08-16
**Status:** accepted

The prop-only component kit keeps `astromech/ui` (most import sites reach components), while the five running-admin exports move to `astromech/ui/app`; the instance guard now records its own module URL so both barrels can call it. Rejected `astromech/admin`, leaving the five in place, and a subpath per binding.
