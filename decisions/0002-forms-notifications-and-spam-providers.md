# 0002 — Forms notifications as blocks, and spam as a provider contract

**Date:** 2026-08-02
**Status:** accepted

Supersedes nothing. Extends [0001](0001-forms-vocabulary-and-table-directories.md),
whose merge-tag definition now covers a notification's **recipient** as well as
its subject and body.

## A notification is a block, not a fixed pair of settings

`@astromech/forms` shipped with two hard-coded emails: a notification to the
site (`notifyEnabled`, `notifyTo`, `notifySubject`, `notifyBody`) and a
confirmation to the submitter (`confirmEnabled`, `confirmSubject`,
`confirmBody`, `confirmToField`). Eight fields, two of everything, and no way to
send two notifications or none.

They are now one `notifications` **blocks** field, one block per notification
kind, mirroring how the same entry type already models its form fields.

A **repeater** was rejected. A repeater is a list of one shape, and the point of
the reshape is that a notification's shape depends on where it is going: an
email has `to`/`subject`/`body`, a Slack message has a channel, a Mailchimp push
has an audience. Blocks carry `_type`, which is the discriminator that makes
those siblings rather than a widening union of optional fields.

Two things fell out of the choice rather than being designed:

- **`_disabled` replaced both enable booleans.** Every blocks instance already
  has an editor-facing disable toggle, so `notifyEnabled` and `confirmEnabled`
  had nothing left to do.
- **`_id` gives each notification stable identity** for diffs and versioning,
  which the old flat settings never had.

## There is no such thing as a confirmation

The only difference between a site notification and a submitter confirmation was
who it was addressed to. Everything else — subject, body, the table of submitted
values — was already editor-written, or differed only in a default.

So `to` is one text field, and the merge tag decides:

```
to: ops@example.com   →  a notification to the site
to: {{email}}         →  a confirmation to whoever filled the form in
```

`confirmToField` (name the field holding the submitter's address) and
`firstEmailFieldName` (guess it, when unnamed) both existed only to answer a
question the merge tag now answers directly, and both are deleted. The two email
templates collapsed into one, because the only thing that differed was the copy
an editor writes.

A **repeater of addresses** for `to` was rejected: it costs several clicks per
recipient and buys stricter per-row email validation that a merge tag makes
impossible anyway (`{{email}}` is not a valid address until it is substituted).
Comma-separated it is, with anything that does not resolve to something
containing `@` dropped rather than sent to — which is exactly what an unresolved
merge tag leaves behind.

Consequence worth stating plainly: **nothing in the code distinguishes the two
cases.** A reader looking for a "confirmation" path will not find one, and
should not add one.

## A spam provider is a value, not a string

Spam protection was `{ provider: 'turnstile' | 'recaptcha', siteKey, secretKey }`
with a single `verifySpamToken` branching on the union — a closed set, and one
function that knew both providers' quirks.

A provider is now an ordinary object satisfying a contract:

```ts
type SpamProvider = {
    name: string; // which widget the front end renders
    siteKey: string; // the public key handed to the browser
    verify(token, context): Promise<SpamVerdict>;
};
```

`turnstile()` and `recaptcha()` are factories returning one, built over a shared
`siteverify()` POST client. Config becomes `spam: turnstile({ siteKey,
secretKey })`.

An **internal-only registry** — keep the string union, split the logic into a
module per provider — was rejected. It is the same amount of work and stops one
step short of the useful part: a site that wants Altcha or hCaptcha can now pass
its own object without a fork. Making the extension point public is the whole
gain.

The secret key never appears in the provider's public surface: only `name` and
`siteKey` are published to the browser, and `verify` closes over the secret.

## `service/` holds service methods and nothing else

The forms service file had grown a form loader, a summary builder, an entry-field
accessor and two type guards around the two methods it exists to declare.

Helpers now live in `utilities/`, matching what core already does
(`packages/astromech/src/utilities/`) and what `@astromech/seo` already does. A
`lib/` directory was rejected on the same grounds `tables/` beat `schema/` in
0001: name the directory after what is in it, and don't introduce a second word
for a thing the codebase already has a word for.

Trivial single-use helpers may stay inline. The rule is about a directory's
purpose, not a line count.
