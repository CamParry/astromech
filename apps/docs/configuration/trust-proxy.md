# Trusting a proxy

How Astromech works out the connecting address of a request, the
`security.trustProxy` option that lets it read `x-forwarded-for` when your site
sits behind a proxy, and what the address is used for.

## Where the address comes from

Astromech only reads sources a client cannot set for itself. On Cloudflare
Workers that is `cf-connecting-ip`, which Cloudflare overwrites on every request
it proxies; it needs no configuration. Everywhere else there is no such header,
so a request arriving through nginx, Caddy or a load balancer carries no trusted
address and Astromech reports none.

`x-forwarded-for` is the header proxies do use, but it is not trustworthy on its
own: a server exposed directly will happily receive one a client made up. Only
your deployment knows whether a proxy sits in front of it, so that is what
`trustProxy` declares.

## What the address is used for

- **Sign-in limits.** Astromech hands the address to Better Auth, which counts
  requests per address and path and answers `429 Too Many Requests` over the
  limit. The counts are kept in the database (the `rate_limits` table), so every
  server process and Workers isolate shares them, and they run whatever
  `NODE_ENV` is set to.
- **The session record.** Each session stores the address it signed in from, in
  `sessions.ip_address`.
- **The forms plugin's submission limit**, described in
  [../plugins/forms.md](../plugins/forms.md).

Astromech passes the address to Better Auth in a header of its own, and drops
any copy of that header the client sent, so Better Auth never reads
`x-forwarded-for` itself.

| Route                                                    | Limit per address      |
| -------------------------------------------------------- | ---------------------- |
| `/api/auth/sign-in/*`                                    | 3 requests a minute    |
| `/api/auth/request-password-reset`                       | 2 requests a minute    |
| `/api/auth/reset-password` and the emailed link under it | 3 requests a minute    |
| `/api/auth/get-session`                                  | not limited            |
| any other `/api/auth/*` route                            | Better Auth's defaults |

Paths are under your `basePath` (`/cms` by default). A minute is counted from
the last request that was let through. Better Auth's defaults for the other
routes are 100 requests per 10 seconds, with lower limits on a few such as
`/change-password`.

When no trusted address is known, every client shares one count per route. On
a Node server without `trustProxy`, one client that sends three sign-in requests
in a minute blocks sign-in for everyone until the minute passes. Better Auth
also counts only a well-formed IPv4 or IPv6 address, and treats any other value
as no address.

## Setting `trustProxy`

```ts
export default defineConfig({
    // ...
    security: {
        trustProxy: true,
    },
});
```

| Value    | Meaning                                            |
| -------- | -------------------------------------------------- |
| `false`  | Default. `x-forwarded-for` is never read.          |
| `true`   | One proxy sits between the client and this server. |
| a number | That many proxies do.                              |

A number must be a whole number of zero or more; any other value stops the
site at startup with an error.

The number must equal the real length of your proxy chain. A single nginx in
front of Astromech, with the usual

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

is `trustProxy: true`. Put a CDN in front of that nginx and it becomes `2`.

Set it only when every request reaches Astromech through a proxy you control.
If a client can also reach the server directly — a container port left open, a
health-check path, a second hostname — it can send its own `x-forwarded-for`,
and the value you are counting on is whatever it chose.

## Why the count is from the end

Each proxy appends the peer it received the request from to the **end** of
`x-forwarded-for`. One proxy between a client and Astromech therefore produces a
one-entry header holding the client's address; chain a second in front and the
header reads `client, proxyA`. So with `n` trusted proxies the client's address
is the `n`th entry from the end, and everything left of it arrived from outside
— on a forged header, the client's own invention. Reading from the left, the way
`trust proxy: true` does in Express, takes that invention.

A count that does not match your deployment is a defect either way. Too low and
Astromech reads one of your proxies' addresses as the client's, so every request
through that proxy shares a key. Too high and it runs off the front of the
header and reports no address at all, rather than falling back to an entry it
cannot vouch for: features keyed on the address stop seeing one, instead of
quietly keying on something a client controls.

The result is not checked for being a well-formed IP address. It is an opaque
key, and an IPv6 address carrying a port or a zone is still a stable one.
