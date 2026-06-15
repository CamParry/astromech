#!/usr/bin/env bash
# PreToolUse(Bash) guard: block git commands that can destroy uncommitted work
# without a recovery path. Added after a sub-agent ran `git reset --hard` on a
# shared dirty tree (2026-06-15) and wiped multiple sessions' uncommitted work.
#
# Blocks (require explicit human approval): reset --hard/--merge/--keep,
# clean -f, checkout -- / checkout . / checkout <ref> -- , restore (worktree),
# stash drop/clear, branch -D, force-push.
# Allows: reset (soft/mixed), checkout <branch>, stash (save/push/list/apply/pop),
# rm, add, commit, status, diff, log, etc.
cmd="$(jq -r '.tool_input.command // ""' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+([a-zA-Z-]+[[:space:]]+)*(reset[[:space:]]+(--hard|--merge|--keep)|clean[[:space:]]+-[A-Za-z]*[fF]|checkout[[:space:]]+(\.|--([[:space:]]|$)|-f|[^[:space:]]+[[:space:]]+--([[:space:]]|$))|restore([[:space:]]|$)|stash[[:space:]]+(drop|clear)|branch[[:space:]]+-D|push[[:space:]].*(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$)))'; then
  cat >&2 <<'MSG'
BLOCKED — destructive git command requires explicit human approval.
Detected one of: reset --hard, clean -f, checkout -- / checkout . / checkout <ref> -- <path>,
restore, stash drop/clear, branch -D, or force-push.
These can permanently destroy uncommitted work on a shared tree.
If you genuinely need this, STOP and ask the human to run it (or to lift this guard).
First snapshot the tree (e.g. an auto-stash / safety branch). See memory: destructive-git-guard.
MSG
  exit 2
fi
exit 0
