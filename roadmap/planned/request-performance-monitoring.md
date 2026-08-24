# Request Performance Monitoring

A dev-only view of what a single request spent its time on: the SQL queries it
ran and how long each took, the plugin hooks it fired, the entry operations it
performed. The mental model is WordPress's Query Monitor, with the same job done
by Laravel Telescope and Symfony's Web Profiler — a per-request performance
panel a developer opens while building a site, not a production monitor.

This is deliberately separate from two things it is often confused with:

- **Boot timing** is a one-off-per-process concern, not per-request. It is
  obtained with a profiler when needed (`node --cpu-prof`, `clinic flame`), not
  instrumented in the code.
- **Production metrics** (cold-start times, error rates, request latency) come
  from the platform (Cloudflare Workers analytics) and a metrics tool like
  Sentry, not from anything Astromech renders itself.

## Shape

- [ ] Request-scoped collector riding the existing request store (`request-context/`), off unless enabled
- [ ] Instrument the database layer to record each query's SQL and duration into the collector
- [ ] Record plugin-hook and entry-operation spans into the same collector
- [ ] A dev-only admin panel that renders the collected data for the request
- [ ] Enable/disable gate (dev-only by default; never active in production)

## Open questions

- Final name. "Monitoring" leans production; the dev-only prior art is called a
  profiler (Symfony) or a debug toolbar. Settle when built.
- Whether the collector reuses one internal timing primitive across the query,
  hook, and entry layers, or each layer records in its own shape.
