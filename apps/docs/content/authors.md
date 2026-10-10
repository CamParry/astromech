# Showing who wrote an entry

Astromech has no author or profile type of its own. A byline is content your
site models, and one of three shapes covers it. Pick by whether every writer
has an account, and by whether the credit can differ from who typed it in.

| Shape                           | Writers need an account | Credit can differ from the account that wrote it |
| ------------------------------- | ----------------------- | ------------------------------------------------ |
| The entry's `createdBy`         | yes                     | no                                               |
| A relationship field to `users` | yes                     | yes                                              |
| Your own `author` entry type    | no                      | yes                                              |

## The account that wrote it

Every entry records who made it in `createdBy`, a user id. Give users the
fields a byline shows, then read the user from your page:

```ts
// astromech.config.ts
users: {
    fields: [
        fields.textarea('bio'),
        fields.relationship('avatar', { target: 'media' }),
    ],
},
```

```astro
---
import { getAstromech } from 'astromech';

const app = await getAstromech();
const post = await app.entries.get({ type: 'post', id });
const author = post.createdBy ? await app.users.get({ id: post.createdBy }) : null;
---

{author && <p>By {author.name}</p>}
```

`createdBy` is who made that locale of the entry, so a translation names its
translator. It is `null` for content written with no signed-in user (a seed
script, the CLI, the scheduler), and once the account is deleted. Use this
shape only when the person who typed it in is always the person credited.

## A user picked on the entry

A relationship field lets an editor credit someone other than themselves:

```ts
entries: [
    {
        type: 'post',
        fields: [
            fields.text('title'),
            fields.relationship('author', { target: 'users' }),
        ],
    },
],
```

Read it as you read `createdBy`: the field holds a user id, and
`app.users.get` resolves it. Mark the field `required` to stop a post being
published without a byline; see [field validation](field-validation.md).

## Writers without an account

A guest writer or a newspaper's columnist may never sign in. Declare an entry
type for them and relate to it:

```ts
entries: [
    {
        type: 'author',
        fields: [
            fields.text('name'),
            fields.textarea('bio'),
            fields.relationship('photo', { target: 'media' }),
            fields.relationship('user', { target: 'users' }),
        ],
    },
    {
        type: 'post',
        fields: [
            fields.text('title'),
            fields.relationship('author', { target: 'author' }),
        ],
    },
],
```

The `user` field is optional and links a writer who does have an account.
Because an author is an entry, it is translated, versioned and published like
any other, and "every post by this author" is a reverse query:

```ts
const posts = await app.entries.query({
    type: 'post',
    where: { references: { path: 'author', id: authorId } },
});
```

See [relationships](relationships.md) for reading a related entry in another
locale.

## Why there is no built-in type

`DECISIONS.md` in the repository, "No first-party author type", records the
choice.
