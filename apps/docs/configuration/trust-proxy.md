# Trusting a proxy

How Astromech works out the connecting address of a request, and the
`security.trustProxy` option that lets it read `x-forwarded-for` when your site
sits behind a proxy. What the address is then used for is the caller's business
— today that is the forms rate limit, [../plugins/forms.md](../plugins/forms.md).

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

Set it only when every request reaches Astromech through a proxy you control.
If a client can also reach the server directly — a container port left open, a
health-check path, a second hostname — it can send its own `x-forwarded-for`,
and the value you are counting on is whatever it chose.

## Why the count is from the right

Each proxy appends the address it saw to the **right** of `x-forwarded-for`. So
the rightmost entries are the ones your infrastructure wrote, and the leftmost
is whatever arrived from outside — which on a forged header is the client's
invention. Reading from the left, the way `trust proxy: true` does in Express,
takes that invented entry.

Astromech therefore counts in from the right, past your proxies' entries, and
takes the next one. With `trustProxy: true` and a header of
`1.2.3.4, 10.0.0.1`, the address is `1.2.3.4`.

If the header holds fewer entries than the hop count, Astromech reports no
address at all rather than falling back to one further left. A hop count that
does not match your deployment fails closed: features keyed on the address stop
seeing one, instead of quietly keying on something a client controls.

The result is not checked for being a well-formed IP address. It is an opaque
key, and an IPv6 address carrying a port or a zone is still a stable one.
