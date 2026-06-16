#!/usr/bin/env bash
# PreToolUse(Bash) guard: block git commands that can destroy uncommitted work
# without a recovery path. Added after a sub-agent ran `git reset --hard` on a
# shared dirty tree (2026-06-15) and wiped multiple sessions' uncommitted work.
#
# Prompts for explicit approval (PreToolUse permissionDecision: "ask") rather than
# hard-blocking: reset --hard/--merge/--keep, clean -f, checkout -- / checkout . /
# checkout <ref> -- , restore (worktree), stash drop/clear, branch -D, force-push.
# Allows: reset (soft/mixed), checkout <branch>, stash (save/push/list/apply/pop),
# rm, add, commit, status, diff, log, etc.
cmd="$(jq -r '.tool_input.command // ""' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+([a-zA-Z-]+[[:space:]]+)*(reset[[:space:]]+(--hard|--merge|--keep)|clean[[:space:]]+-[A-Za-z]*[fF]|checkout[[:space:]]+(\.|--([[:space:]]|$)|-f|[^[:space:]]+[[:space:]]+--([[:space:]]|$))|restore([[:space:]]|$)|stash[[:space:]]+(drop|clear)|branch[[:space:]]+-D|push[[:space:]].*(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$)))'; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Destructive git command (reset --hard, clean -f, checkout -- <path>, restore, stash drop/clear, branch -D, or force-push). These can permanently destroy uncommitted work on a shared tree — approve only if you intend it. Consider snapshotting first (auto-stash / safety branch). See memory: destructive-git-guard."}}
JSON
  exit 0
fi
exit 0
