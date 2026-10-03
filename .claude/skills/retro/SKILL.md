---
name: retro
description: 'Conduct a retrospective on a coding session.'
disable-model-invocation: true
---

The user has asked for a **retrospective**. You are suggesting improvements to the coding agent's **environment** to improve future runs.

## Steps

1. Write in plain English, as `AGENTS.md` ("Documentation") and the user's own instructions ask: short sentences, the established word, no em dashes.

2. Read the primary sources for the session the user specifies. Session logs are the `.jsonl` files under `~/.claude/projects/-Users-cam-Documents-Projects-Astromech/`; the memory notes beside them record lessons already learned. If the user doesn't specify a session, default to the current one.

3. Look for candidates for improvement in these categories.

- **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** make it easier? _Use when_ the session took a long time to find a piece of information.
- **Automated checks**: are there automated checks that could catch errors the agent made? Linting, typing, tests, filesystem linters? Read the repo's own checks first (the table in `AGENTS.md`, the scripts in `package.json` and `scripts/`, the pre-commit hook, and `.github/workflows/ci.yml`), so a check that already exists but sits unwired or silently broken is the finding, not a reinvention. A repo with no **guardrail** (no pre-commit hook and no CI job running its lint/typecheck/test command) is itself a finding: an un-linted repo is a standing missed opportunity, not a neutral default. _Use when_ the agent made a mistake an automated check could have caught, or the repo has no guardrail at all.
- **Coding standards**: should the review (the `review` skill, and the `audit` brief in `.claude/_agents/audit.md`) enforce a new rule? Should an existing rule be removed or clarified? Classify the violation first: a **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check, full stop: a custom rule in `eslint.config.js`, a script under `scripts/`, the pre-commit hook, or a CI job, whichever is cheapest. Default to building the check over writing the rule. Reserve the `code`, `api` and `testing` skills for genuine **judgement calls** (cross-file consistency, "matches the surrounding style," anything no guardrail could ever substitute for). _Use when_ the review failed to catch a mistake.
- **Global AGENTS.md**: are there any steering instructions that should be moved to coding standards (or automated checks) instead? _Use when_ the AGENTS.md file is particularly large - in the repo OR the user's global scope.
- **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is there any custom tooling (CLI's, MCP's) that is particularly token-inefficient? _Use when_ the agent made an expensive tool call.
- **No-ops**: look for instructions in steering files that don't modify the agent's behavior. _Use when_ the steering files are large and unwieldy.
- **Information access**: look for opportunities to increase the agent's access to information. Teeing dev server logs, readonly access to third-party services. _Use when_ a crucial piece of information was not available to the agent.

4. Present these candidates to the user, in order of severity.

## Reference

### Implementation vs Review

Remember that all work goes through two stages: implementation and review. The implementation agent has the most **context pressure**. They are responsible for exploration, writing code, and debugging failures.

The review agent has the least context pressure - it receives a diff, so no exploration needed. It often does not need to write code or debug.

This means that the review agent should be responsible for imposing coding standards, not the implementation agent.

### Files

You have access to several files in the repo:

- `AGENTS.md` and the nested `AGENTS.md` files: these are pushed to the context window of any agent working in this repo. Use them sparingly, mostly for **navigation pointers** to other files.
- The standards skills (`code`, `api`, `testing` under `.claude/skills/`): read by the review as well as during implementation. The `css`, `docs` and `ui` skills are parked under `.claude/_skills/` on purpose; revive one only as goals with reasons, never as a list of rules.
- Docs: `ARCHITECTURE.md`, `TERMINOLOGY.md`, `DECISIONS.md` and `roadmap/`, pointed to by other files. A fact lives in one file. Look for an existing doc before writing a new one.
- Skills: use a skill for reference docs (its description goes into the agent's context window) or for a user-invoked command.
- Memory notes: a lesson that keeps recurring there is a candidate for a check or a hook instead.
