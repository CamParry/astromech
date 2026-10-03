# Trusting a proxy

How Astromech works out the connecting address of a request, the
`security.trustProxy` option that lets it read `x-forwarded-for` when your site
sits behind a proxy, and what the address is used for.

## Where the address comes from

Astromech only reads sources a client cannot set for itself:

- On Cloudflare Workers, `cf-connecting-ip`, which Cloudflare overwrites on
  every request it proxies. It needs no configuration.
- With `trustProxy` set, the entry of `x-forwarded-for` your proxies vouch for
  (below).
- Otherwise, on Node, the address of the connection itself, which Astro passes
  on as `clientAddress`.

The connection's address is the client's only when nothing sits in between.
Behind nginx, Caddy or a load balancer it is the proxy's address, so every
client shares it until you set `trustProxy`. When Astromech counts the
connection's address for a request that carries `x-forwarded-for`, `forwarded`
or `cf-connecting-ip`, it logs once that you may need to set `trustProxy`.

On a server of your own that calls `Astromech.fetch` rather than serving through
Astro, pass the socket peer's address as `remoteAddress`, never a header value:

```ts
import { getAstromech } from 'astromech';

const app = await getAstromech();
// `req` is the Node `IncomingMessage` the `Request` was built from.
const response = await app.fetch(request, { remoteAddress: req.socket.remoteAddress });
```

Without it, and without `trustProxy`, Astromech knows no client address, so
every client shares one count in each rate limit.

Astro reads `x-forwarded-for` itself when its own `security.allowedDomains`
option is set, so its `clientAddress` may then be a value the client made up.
Astromech does not use it in that case: with `allowedDomains` set and no
`trustProxy`, a Node site has no client address, and Astromech warns at
startup.

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

| Route                                                    | Requests let through per address |
| -------------------------------------------------------- | -------------------------------- |
| `/api/auth/sign-in/*`                                    | 3                                |
| `/api/auth/request-password-reset`                       | 2                                |
| `/api/auth/reset-password` and the emailed link under it | 3                                |
| `/api/auth/get-session`                                  | not limited                      |
| any other `/api/auth/*` route                            | Better Auth's defaults           |

Paths are under your `basePath` (`/cms` by default). A count resets only once a
full minute passes with no request let through, and requests past the limit are
refused until then: three sign-in attempts, then blocked until a minute passes
with none allowed. Spacing attempts out does not reset it, so a sign-in every
50 seconds is refused on the fourth. Better Auth's defaults for the other
routes are 100 requests per 10 seconds, with lower limits on a few such as
`/change-password`.

When no client address is known, every client shares one count per route, and
one client that sends three sign-in requests blocks sign-in for everyone until a
minute passes. The same happens behind a proxy without `trustProxy`, where
every client shares the proxy's address. Better Auth counts an IPv6 address by
its `/64` network, the block one customer is usually given.

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

Astromech reads the entry without a port (`203.0.113.7:5678`) or IPv6
brackets (`[2001:db8::1]:443`), and treats an entry that is not an IP address
as no address at all, logging the first one it drops.
