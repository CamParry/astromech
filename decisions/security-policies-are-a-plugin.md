---
area: product
---

# Core security is defaults; policies are a plugin

Core holds what every site gets with no configuration (sign-in limits, account locks, headers, sign-out everywhere) and the mechanisms several surfaces share (the trusted client address, counters, the block list, captcha, security events). Policies a site opts into, such as country blocks or password rules, belong to [`@astromech/security`](../roadmap/proposed/security-plugin.md). The test: if turning it on for every site would surprise or break one, it is a policy. Filtering before the app (WAF, DDoS, TLS) is left to the host. Prior art: WPMU DEV Defender.

**Rejected:** everything in core; everything in a plugin (ships sites without sign-in protection).
