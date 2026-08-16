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
