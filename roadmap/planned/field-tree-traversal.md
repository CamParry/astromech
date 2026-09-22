# Field-tree traversal

Every walk over an entry type's fields goes through one traversal and asks the
field's `FieldType` what to do, so a new field type, core or plugin, works in
parsing, codegen, visibility, references, config validation and the admin with
no walker edited. Payload's `traverseFields` and `fieldAffectsData` are the
model.

## Why

- `FieldType.children` walks values; nothing walks the schema. So
  `fields/references.ts` fabricates a value (`probeValue`) to reuse `children`,
  and `content/visibility.ts` and `codegen/type-generator.ts` each branch on
  `'group' | 'repeater' | 'blocks' | 'tree'` themselves.
- Type lists live outside the registry: `fields/flatten.ts` and
  `config/validate/field-tree.ts`. Rich-text public rendering sits in
  `visibility.ts` instead of the rich-text type.
- A plugin field type is registered only on the admin side
  (`fields/field-type-registry.ts`), so `parse-fields.ts` runs no coercion,
  default or validation for its value. `serverValidate` (`types/plugins.ts`) is
  documented as enforced and nothing reads it; `typeGen` is a parallel codegen
  path beside `tsType`.
- seo's `preview` is a named field that stores nothing, against "a name is
  always a data key".
- `media.fields` and `users.fields` never run `validateFieldTree`.

## The work

- [ ] Add `subFields(field)` to the four nested types in
      `fields/core-field-types.ts`, and `traverseFields(fields, visitor)` in
      `fields/traverse.ts` (layout fields unwrapped, `private` inherited, path
      segments supplied). `references.ts` uses it; delete `probeValue`.
- [ ] `content/visibility.ts` strips over `children` and a new
      `FieldType.toPublic`; rich-text rendering moves to the rich-text type.
- [ ] `config/validate/field-tree.ts` runs on `traverseFields`; container and
      unnamed-type facts become `FieldType` properties. Run it for
      `media.fields` and `users.fields`. The duplicate-name check descends into
      `blocks`, which also extends the `tabs`/`tab` rules into blocks (a
      behaviour change).
- [ ] Codegen: `tsType(field, shape, emit)`, where `emit` renders a nested
      scope, so the container cases move into their types. Prefix hoisted tree
      aliases with the entry type and pass entry-type keys through
      `propertyKey()`, fixing the colliding `.d.ts`.
- [ ] Plugin field types are `FieldType`s, registered when plugins resolve
      (`type`, `tsType`, `coerce`, `validate`, `defaultValue`, `affectsData`);
      the admin component specifier stays in the admin-side map. Delete
      `serverValidate`, `typeGen` and codegen's plugin field-type path. Test
      with the demo's `rating`: an out-of-range value is refused on the server,
      and a missing value gets the default. **Public API.**
- [ ] `affectsData: false` on seo's preview type; data consumers skip it and
      the admin renders it. Amend the `DECISIONS.md` entry on structural-field
      names for fields that affect no data.
- [ ] Admin: `field-error-summary.ts`, `utilities/defaults.ts` and
      `rendering/resolve.ts` use the shared traversal. Show an error on a root
      named boxed group, and require a label on a raw unnamed `tab`.
- [ ] Guard: a fixture plugin container type carried through parse, codegen,
      visibility, references and the relationships index, and a drift-report
      pattern for `.type` compared with a core container or layout literal
      outside `packages/astromech/src/fields/` and
      `packages/admin/src/components/fields/`.
