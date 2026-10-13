---
area: ai
---

# The assistant stays on topic by its prompt

A request is on topic when its result ends up in, or acts on, this site: body copy, alt text, SEO advice, how to use the admin. An unclear one gets a question, not a refusal. The prompt is the same across roles and installs, so its cached prefix holds; a site appends house rules through the `instructions` option, as OpenAI's Assistants API and Sanity AI Assist name it (`packages/plugins/assistant/src/loop/request.ts`). Anthropic's customer-support guide keeps a bot on topic the same way.

**Rejected:** a classifier call per turn (OpenAI's cookbook; cost, latency, over-refusal); a refusal listing the role's tools (loaded on demand); a replaceable prompt (drops the tool-search paragraph).
