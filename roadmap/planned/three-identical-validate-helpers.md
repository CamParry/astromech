# Three identical validate helpers

`entries/internal/validate.ts`, `users/internal/validate.ts` and
`media/internal/validate.ts` are byte-identical: the same twelve lines wrapping
a zod parse and re-throwing `ZodError` as the framework's 422.

```ts
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (err) {
        if (err instanceof z.ZodError) throw new ValidationError(err.issues);
        throw err;
    }
}
```

Seven call sites across the three domains.

## The work

- [ ] One implementation. It depends only on `zod` and `errors/validation`, so
      it belongs in a leaf rather than in any one domain.
- [ ] Pick the home against the layer table in `ARCHITECTURE.md`. `utilities/`
      holds pure helpers and is where the stage 1 symbol moves landed; `errors/`
      is the other candidate, since what the function really does is translate
      one error type into another.
- [ ] Update the seven call sites and delete the three copies.

## Why it was left

Found while finishing the config-at-boot work. It crosses three domains, which
makes it a change of its own rather than something to bury in a stage whose
subject is config.
