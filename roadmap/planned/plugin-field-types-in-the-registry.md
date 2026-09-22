# Plugin field types in the field-type registry

A plugin field type is registered only on the admin side. `registerFieldType`
(`fields/field-type-registry.ts`) is called for core types alone, so
`getFieldType('rating')` is `undefined` and `fields/parse-fields.ts` runs no
coercion, default or validation for a plugin field's value. `serverValidate`
(`types/plugins.ts`) is documented as enforced on every mutation, and nothing
reads it. The plugin's `defaultValue` is applied only in the admin
(`plugin-field.tsx`). Codegen has a parallel path for them (`typeGen` in
`codegen/type-generator.ts`) beside `tsType`.

## The work

- [ ] A plugin's field-type declaration becomes a real `FieldType` (build,
      tsType, coerce, validate, defaultValue), registered when plugins resolve.
      The admin component specifier stays in the admin-side map.
- [ ] Delete `serverValidate` and `typeGen`.
- [ ] Test with the demo's `rating` field: an out-of-range value is refused on
      the server, and a missing value gets the default.
