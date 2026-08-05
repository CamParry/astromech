# 0024 — Removing the content operations

**Date:** 2026-08-06
**Status:** accepted

`packages/astromech/src/content/` is deleted: the `translate`, `transform` and
`generate` operations, the `ContentProvider` port they dispatched through, their
HTTP routes, their three permissions and the four `Content*` types. This record
is why they went rather than got rewired, and what has to come back with them.

## What was there

Three service methods over a `ContentProvider` port that nothing implemented,
anywhere. Core declared the port, core called it, and no driver, plugin or site
ever supplied one.

That would have been merely dead code if it had stayed private. It didn't: the
methods were on the manifest, so they were projected into tool definitions, so
the assistant could search them up, read a plausible description, and call
them — and the call failed at runtime. The worst version of an unimplemented
feature is one an agent can discover.

## Why deleted rather than wired up

The missing piece is not an implementation. It is a user interface.

Whether an author reaches these through a per-field button, a rich-text toolbar
item, a document-level action, or something else decides what the operation
takes and returns: which fields it touches, whether it works on a selection,
what it does with the result, and what the author sees while it runs. The
operation shape follows the UI shape.

Writing the operations before that question had an answer is exactly what
produced the module being removed. Building the same thing again on the same
missing input would produce the same result, so the module goes and the design
question stays open.

## What must carry forward when they return

Two properties of the removed design were right, and are recorded here so they
are not rediscovered the hard way.

**The operation owns the read, the field selection, the placement and the
write.** Entry data never round-trips through a model's context as something the
model must reconstruct. The operation fetches the fields, sends only their
values, and puts the returned values back where they came from. A model asked to
regurgitate a whole document with one part changed will quietly drop, reorder or
reword the rest, and nothing downstream can tell that from an intended edit.

**The result lands staged or unpublished, for human review.** Never published.
An operation that writes live content is a single model call away from a public
mistake, and the staging substrate that makes review cheap already exists.

## The open permission question

Unanswered, with a lean: these are probably **not** their own permission
namespace, and fold into the target type's `update` instead.

The removed design had a double gate — a caller needed both `content:translate`
and `entry:post:update` — which existed only because the two live in disjoint
namespaces and each had to be checked separately. That is a mechanism produced
by the naming, not by a requirement. Folding the operation into the permission
for the write it performs retires it, at the cost of losing the ability to grant
"may translate but may not otherwise edit", which nobody has asked for.

## What the removal simplified

`content` was the one domain the layer model allowed to import another domain,
and the directory map and the layer model both carried a parenthetical saying
so. Removing it dissolves that exception: domains are now siblings with no
special cases, which is one fewer rule to hold when deciding where new code
goes.
