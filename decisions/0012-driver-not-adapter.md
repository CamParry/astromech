# 0012 — "Driver" over "adapter" for pluggable backends

**Date:** 2026-08-04
**Status:** accepted

Recorded when `TERMINOLOGY.md` was stripped of rationale under `0011`. The
reasoning had been sitting in that file since the vocabulary was settled; this
record is its home, and the terminology entry now states only what a driver is.

Both words are current in the ecosystem for the same idea. Payload calls them
adapters, AdonisJS calls them drivers, and either would have been guessable.

**Driver won on consistency.** `DatabaseDriver` was already named and already
shipped, so "adapter" would have meant either renaming it or living with two
words for one concept across `StorageDriver` and `EmailDriver`.

It is also the more accurate of the two here. An adapter reshapes one interface
into another, which is a compatibility job; these are low-level connectors that
own a connection to a specific external system and expose a uniform surface over
it. Nothing about `r2()` or `ResendDriver` is a shim over a mismatched API.

The cost is that "adapter" appears in the codebase for a genuinely different
thing — `tableStorage` is an `EntryStorage` adapter, reshaping plugin tables into
the interface the admin expects. Keeping the two words apart is the point: a
driver reaches an external system, an adapter reshapes an internal interface.
