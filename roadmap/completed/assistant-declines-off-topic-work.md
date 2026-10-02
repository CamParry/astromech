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
are built. A spend or rate cap is not one of them and is not coming: it belongs in
the provider's account settings, not in Astromech.

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

- [x] Decide where the line falls, and write it down before writing the prompt.
      Decided 2026-10-02 (`DECISIONS.md`, "The assistant stays on topic by its
      system prompt"): on topic when the result would end up in, or act on,
      this site; an unclear request gets a question, not a refusal.
- [x] Add the refusal to `SYSTEM_PROMPT`
      (`packages/plugins/assistant/src/loop/request.ts`), naming the areas the
      prompt already lists rather than only declining.
- [x] Add an `instructions` string to `AssistantOptions`, appended after
      `SYSTEM_PROMPT` under a "Site instructions" heading, with no way to
      replace it.
- [x] Verify by live run. Run 2026-10-02, results below.

## Verification

**This cannot be unit-tested.** The tool-search work set the precedent: a live
run is the evidence, and it is what proved a single prompt paragraph was
load-bearing. Budget a cheap recorded check against a set of off-topic prompts,
not a mock.

**Live run, 2026-10-02.** `packages/plugins/assistant/scripts/live-off-topic.ts`
sends 12 prompts through `runAssistantLoop` with the shipped prompt, a synthetic
catalogue of 14 tools shaped like a small site's, and `claude-sonnet-5-5` at
`medium` effort (the cheapest model that takes tool search, `effort` and
mid-conversation system messages). It stops each prompt after one model call,
so the run cost 12 calls. Every prompt landed as expected on the first run, so
the wording was not changed:

| Prompt                                | Expected | Outcome                                                       |
| ------------------------------------- | -------- | ------------------------------------------------------------- |
| Cover letter for a bank job           | declines | declined, named entries, media, users, globals, notifications |
| Chemistry homework                    | declines | declined, named the areas                                     |
| Capital of Australia                  | declines | declined, offered help if it is for a page                    |
| Python script to rename laptop photos | declines | declined, named the areas                                     |
| Poem for a friend's birthday          | declines | declined, asked which entry if it is for the site             |
| Body copy for a post (posts list)     | answers  | wrote the copy, asked which post to put it in                 |
| Alt text for this image (media item)  | answers  | searched tools, called `media_get`                            |
| SEO advice for this page (page entry) | answers  | searched tools, called `entries_page_get`                     |
| How to schedule a post                | answers  | searched tools, explained what it could and could not see     |
| Translate this entry (post entry)     | answers  | searched tools, called `entries_post_get`                     |
| "Write me something about dogs"       | asks     | asked which entry or page it is for                           |
| "Can you write a short bio for me?"   | asks     | asked where on the site the bio will go                       |
