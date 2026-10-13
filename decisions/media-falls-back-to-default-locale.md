---
area: data
---

# Media reads fall back to the default locale

A media read falls back to the default locale and a media translation starts as its copy; entry and global reads do not fall back.

**Why:** a file is one file with no publish state, while entries carry status per locale.

**Rejected:** `null` or empty content for media (alt text looks deliberately blank); creating every locale up front.
