---
area: data
---

# A structural field's name is a data key

A named `group`, `accordion` or `tab` nests its fields under that name; an unnamed one only draws a surface, as Payload's groups do (`packages/astromech/src/fields/builder.ts`). A type with `affectsData: false`, such as seo's preview, is the exception: its name only keys it in the admin.

**Rejected:** a `section` type, a `nest` flag or inert names (walkers learn new kinds); the name inside options (breaks `type(name, options)`).
