---
milestone: later
---

# Agent tooling and docs

From a comparison with Matt Pocock's course-video-manager
(https://github.com/mattpocock/course-video-manager, commit `58b4c0e`) on
2026-10-01, split out on 2026-10-02. Paths are under `packages/astromech/src/`
unless they start with a top-level folder; line numbers were taken on
2026-10-01 and may have drifted.

## Next

The `.claude/` rewrite another session was doing landed on 2026-10-03: the
`audit` brief (`.claude/_agents/audit.md`, replacing `reviewer`) and the
`retro` and `review` skills. Check which items below still hold, then move
this file to `planned/`.

## The work

- [ ] **Remove instructions that send agents the wrong way.**
      `.claude/commands/feature.md:23` creates worktrees under
      `.claude/worktrees/`, inside the repo, which `AGENTS.md` says breaks
      resolution; the same file names the parked `coder` and `tester` agents.
      `AGENTS.md:88`, `packages/admin/AGENTS.md:3`, `apps/docs/AGENTS.md:3` and
      `roadmap/README.md:26` point at the parked `docs`, `ui`, `css` and
      `testing` skills. `.claude/skills/code/SKILL.md:165-171,205` has rules the
      code contradicts (named exports only, no `style={{}}`, `@/` imports only,
      three commit types), and the `api` skill still describes `safeParse`
      routes. `.claude/settings.local.json` repeats both project hooks.
- [ ] **Turn repeated-mistake memories into hooks and checks.** Give
      `scripts/check-boot.mjs` and `scripts/check-boot-cloudflare.mjs` a
      throwaway `BETTER_AUTH_SECRET` and an unset `NODE_ENV`, as
      `scripts/check-install.mjs:122` does. Make
      `.claude/hooks/block-destructive-git.sh` ask on `stash`, `--no-verify`
      and `npm install`. Deny `isolation: "worktree"` on the Agent tool. Add a
      drift test over `apps/demo-cloudflare/migrations/snapshot.json`. Retire
      the matching memory notes.
- [ ] **Cite decisions by title, and check the citation.** 22 code comments
      cite a bare `(DECISIONS.md)`, e.g. `entries/internal/update-batch.ts:149`.
      Cite the entry's title, and have `scripts/check-docs-links.mjs` confirm
      it matches a bold lead. Fix the stale `why` at
      `scripts/report-drift.mjs:66`.
- [ ] **Tighten `TERMINOLOGY.md`.** Give the seven bare rejections a reason
      (Entry, Global, Repository, Resource, Resource type, Driver, Admin
      resource). Add the missing two-way guards: Confirmation and Approval,
      Integration and Adapter, Request scope and App context, Admin resource
      and Resource. Move code names out of Resource, Resource type, Schema and
      Version. Add Status, Draft, Hook and Role.
- [ ] **A roadmap file skeleton.** Why; Prior art; Decided; The work;
      then Testing (what is tested at which seam, what deliberately isn't, and
      why) and Out of scope where they apply. `Blocked by:` and `Done when:` go
      only on an item where they are not obvious. Record it in the `docs`
      contract and `roadmap/README.md`.
- [ ] **Merge bodies that carry evidence.** Merge branches with `--no-ff`
      so the Drift line `AGENTS.md:53` asks for has a home: 4 merges among 204
      first-parent commits since 2026-09-20. Add Evidence (the test that fails
      without the change) and Reversible (yes or no). Rejected: "Door"
      (one-way or two-way), Amazon's jargon.
- [ ] **Refresh the Matt Pocock skills.** `grilling` is the old
      one-question-at-a-time version. `ubiquitous-language` was removed
      upstream but `.claude/commands/plan.md:28` still recommends it. Link
      `diagnosing-bugs`, `pr` and `writing-for-agents`. Add a note to
      `AGENTS.md` mapping his `GLOSSARY.md`, ADRs and specs to
      `TERMINOLOGY.md`, `DECISIONS.md` and `roadmap/`, so `code-review` finds
      them.
- [ ] **Log the demo dev server to a file.** Tee `apps/demo/package.json`'s
      `dev` output to a file agents can read, since they may not restart your
      server, and say so in `apps/demo/AGENTS.md`.
