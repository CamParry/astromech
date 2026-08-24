# The assistant declines off-topic work

The assistant's system prompt describes the tools and nothing else, so nothing
tells the model to decline "write my cover letter". This file is about that
refusal — what it covers, what it says, and how a site adjusts it. It is not
about capping spend, which is not coming.

Split out of `roadmap/completed/ai-integration.md` on 2026-08-08, where it was
P11 and the last open item. It was never load-bearing for that work: every
enforcing limit the assistant has was built and shipped without it.

## Why it is worth doing

A CMS assistant that answers general questions is an uncapped bill on the site
owner's API key, and it is not what the drawer is for.

## What is already settled

**A system prompt shapes the default, it is not a boundary.** The enforcing
limits are the tool surface, `readOnly` and the permission scope, and all three
are built. A spend or rate cap is not one of them and is not coming —
`DECISIONS.md` records why that belongs in the
provider's dashboard.

So whatever ships here changes what the model does by default, not what it is
able to do. Write that into the work rather than discovering it later.

## Open questions

- **Where the line falls.** "Off-topic" is easy to name and hard to draw. Drafting
  body copy for an entry is the assistant's job; drafting a cover letter is not;
  both are "write me some prose". A rule that catches the second without
  catching the first is the actual design problem, and nothing here has one yet.
- **What the refusal says.** Decline and name what it can do instead — an
  assistant that only says it can't help reads as broken. That means the refusal
  needs to know the site's tool surface, which varies per install and per role.
- **How a site adds house rules.** A site should be able to append to the prompt,
  never replace it: a replaced prompt drops the tool-naming paragraph the tool
  search depends on. Whether that is a config option, a plugin hook, or something
  else is undecided.

## Change

- [ ] Decide where the line falls, and write it down before writing the prompt.
- [ ] Add the refusal to the system prompt, naming the alternative rather than
      only declining.
- [ ] Give a site an append-only way to add its own rules.
- [ ] Verify by live run.

## Verification

**This cannot be unit-tested.** The tool-search work set the precedent: a live
run is the evidence, and it is what proved a single prompt paragraph was
load-bearing. Budget a cheap recorded check against a set of off-topic prompts,
not a mock.
