---
area: data
---

# Uploads lose GPS data and keep other metadata

An uploaded original has its GPS values blanked in place, as exiftool's `-gps:all=` does (`packages/astromech/src/media/internal/gps.ts`).

**Why:** the original is public, and blanking in place runs on Workers and keeps the pixels.

**Rejected:** stripping all metadata (drops the photographer's copyright); re-encoding (changes pixels, needs sharp); zeroing only the GPS pointer (readers follow it into the header).
