# A failed media delete leaves an item with no file

`packages/astromech/src/media/methods/delete.ts` deletes the stored original
and its variants before the transaction that deletes the row. If the row
delete fails, the item stays in the library and its file is gone. Found by
`packages/astromech/tests/media/delete-files.test.ts` in stage 5 of
[test-suite-review](../completed/test-suite-review.md), which marks the case
as an expected failure.

## The work

- [ ] Delete the stored files after the row's transaction commits, so a failed
      delete leaves the item whole and a failed file removal leaves at worst an
      orphaned file. Turn the expected failure into a passing case.
