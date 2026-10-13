---
area: structure
---

# A fields list holds fields, layout and widgets

An item's kind tells them apart: a field stores a value, layout (`tabs`, `accordion`, an unnamed `group`) arranges children, and a widget displays and acts but stores nothing. Listing an item under `main` or `sidebar` decides where it shows; the dashboard takes widgets only. Edit screens render no `<form>`, so a widget can render its own ([admin widgets](../roadmap/planned/admin-widgets.md)). Prior art: Filament 4.

**Rejected:** a flag such as `affectsData` or `readOnly` (`readOnly` means stored but not editable); placement declared by the item (Payload's `admin.position`, #8789); one `<form>` around the screen (inner forms need portals; Strapi #22833).
