# 0038 — A route declares itself, and one table is read by handler, document and client

**Date:** 2026-08-09
**Status:** accepted

REST routes become one data table of `(verb, path, method id)` plus wire facts, read by the Hono handler, the OpenAPI document and the fetch client, with only per-route `args` hand-written; an audit collapsed 35 of 56 handlers and kept 21 bespoke (declared with `handler: 'bespoke'`). Added `POST /rpc/:id` to reach any manifest method. Rejected build-time client codegen, retiring REST for RPC, and retiring the hand-written CLI commands.
