# `toolUseId` is the last Anthropic word in the assistant

**Shipped 2026-08-06.** `@astromech/assistant` runs on the AI SDK, where a call's
identifier is `toolCallId` on a `ToolCallPart` and a `ToolResultPart`. The
approval path still called the same value `toolUseId`, from Anthropic's
`tool_use` block, so a reader following a value from `part.toolCallId` into an
approval row watched it change name for no reason, and the vocabulary pointed at
an SDK the package no longer depends on.

- [x] `ApprovalRequest.toolCallId` in `src/types.ts`
- [x] `ClaimedApproval.toolCallId` and `ApprovalDraft` in `src/approvals/storage.ts`
- [x] `ApprovalRow` and the `tool_call_id` column in `src/tables/approvals.ts`
- [x] the `UnrunCalls` / `RejectedCalls` keys in the drawer
- [x] the plugin's migration baseline, and every dev database rebuilt with it

Sixteen files, 28 lines, no behaviour change. `src/loop/approvals.ts` holds the
line the rename was for: it read `toolUseId: call.toolCallId` and now reads
`toolCallId: call.toolCallId`.

## Anthropic's `tool_use_id` stays

`tool_use_id` is also the field name on Anthropic's own `tool_result` content
block, which the wire transcript still carries. Two occurrences —
`tests/routes/chat.test.ts` and `tests/loop/request.test.ts`, both inside
`{ type: 'tool_result', … }` — are provider wire format and were deliberately
left alone. A blind sweep over the package renames them too, and the transcript
stops round-tripping.

## The baseline rewrite fails differently from the package rename

The baseline was rewritten in place rather than a migration appended, which is
legal only because nothing is deployed.

`roadmap/completed/ai-capability.md` records the package rename leaving every dev
database unmigratable, because the ledger namespaces plugin migrations by package
and kysely refuses to run when a previously executed migration is missing. **This
change fails the other way, and it is the more dangerous of the two.** The package
is unchanged, so the ledger tag stays `0000_baseline` and the row still matches —
kysely sees a migration it has already applied, skips it, and exits successfully
against a table that still has the old column. `db:init` prints
`Database migrations applied` and nothing looks wrong until an insert hits
`tool_call_id`.

So the recovery is not the ledger-clearing sequence: it is deleting the database
and rebuilding it. The demo was rebuilt with `db:init` and reseeded with
`db:seed:demo`.

## Browser-verified live 2026-08-06

Against the demo on 4323 with a real key, on the rebuilt database. Asked to
create a page, the turn paused and the row was minted with `tool_call_id`
populated, `pending`, arguments intact, and no page existing. Approve resolved it
to `approved` with `arguments` nulled and `resolved_at` set, and the page was
created from the row. The session row persisted the transcript.

That covers every renamed read: `toApprovalRequest` builds the request the drawer
rendered its awaiting chip from, `unrunCalls` keys off it, and `resultFor` matches
the claimed row against the call to run the approved write.

## `plugin:generate` is the check on a hand-edited baseline

`migrations/0000_baseline.ts` and `migrations/snapshot.json` were hand-edited
rather than regenerated, which leaves no test guarding them —
`packages/astromech/tests/db/baseline-ddl-parity.test.ts` covers `CORE_TABLES`
only, not plugin baselines. Running `astromech plugin:generate` from the plugin
root and getting `no changes` is what proves the hand-edit is byte-for-byte what
the emitter produces from the renamed descriptor. It was run before the change as
well, so that `no changes` afterwards meant something.

## Related

- `roadmap/planned/migration-baseline-regeneration.md` — the `db:rebaseline`
  command that would make this an explicit operation rather than a hand-edit.
- `DECISIONS.md` — what the row is for.
