/**
 * The database driver contract: what `db` in the config must provide.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import type { MigrationProvider } from 'kysely/migration';

export type DbDump = {
    /** Raw bytes of a consistent SQLite snapshot. */
    stream: ReadableStream<Uint8Array>;
    /** Release temp resources (e.g. delete the temp dump file). Always call when done. */
    cleanup: () => Promise<void>;
};

export type DatabaseDriver = {
    /** The driver's name, as `libsql` or `d1`. */
    name: string;
    getInstance(): Kysely<DB>;
    /**
     * Whether the driver supports interactive transactions (`BEGIN`/`COMMIT`
     * across round-trips). Absent or `true` means yes. Cloudflare D1 has no
     * interactive transactions — only `batch()` — so it declares `false`, and
     * domains that can degrade (the entry repository) drop their transaction method
     * rather than pretending.
     */
    supportsTransactions?: boolean;
    /**
     * Whether this driver talks to a database the developer's machine does not
     * own. Optional and feature-detected: a driver that cannot tell omits it and
     * the CLI treats the database as local.
     */
    isRemote?(): boolean | Promise<boolean>;
    /** Produce a consistent full-DB snapshot. Optional — absent on drivers that can't dump in-process (e.g. D1). */
    dump?(): Promise<DbDump>;
    /** Restore a full-DB snapshot from raw SQLite bytes, migrated to this schema first. Optional. */
    restore?(source: ReadableStream<Uint8Array>, opts: RestoreOptions): Promise<void>;
};

/** How `DatabaseDriver.restore` brings a backup in. */
export type RestoreOptions = {
    /** Tables whose live rows stay as they are. */
    preserve: string[];
    /** Tables left empty rather than restored. */
    empty: string[];
    /** The site's merged migration chain, run forward on the backup before the copy. */
    migrations: MigrationProvider;
};
