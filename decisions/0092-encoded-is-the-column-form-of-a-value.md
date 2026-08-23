# 0092 — `encoded` is the column form of a value

**Date:** 2026-08-24
**Status:** accepted

In `database/`, the value's driver-boundary form is `encoded` (`ColConfig.storage` → `encoded`, `StorageData` → `EncodedData`, `StorageCellBase` → `EncodedCellBase`), beating `column` (taken) and Drizzle's `driverParam` (reads backwards for select cells); the declared SQL type becomes `columnType` (`SQLITE_COLUMN_TYPE`). "Storage" is reserved for blobs per 0075, keeping only `AsyncLocalStorage` and `src/storage/`.
