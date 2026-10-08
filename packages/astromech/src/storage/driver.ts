/**
 * The storage driver contract: what `storage` in the config must provide.
 */

export type StorageRange = {
    /** Byte offset of the first byte to return. */
    offset: number;
    /** Bytes to return. Omit for "to the end of the object". */
    length?: number;
};

export type StorageObject = {
    body: ReadableStream;
    /** Bytes in `body` — less than `totalSize` for a ranged read. */
    size: number;
    /** Full object size, regardless of range. Needed to emit `Content-Range`. */
    totalSize: number;
    contentType?: string;
    etag?: string;
};

export type StorageStat = {
    size: number;
    contentType?: string;
    etag?: string;
    uploadedAt?: Date;
};

export type StorageList = {
    keys: string[];
    /** Present when more keys remain. Pass back to continue. */
    cursor?: string;
};

/** Options for `StorageDriver.put`. */
export type StoragePutOptions = {
    contentType?: string;
    /**
     * The body's length in bytes, when the caller knows it. A driver whose
     * backend needs a length holds a stream given without one in memory.
     */
    contentLength?: number;
};

export type StorageDriver = {
    name: string;

    /** Store `body` under `key`. Any stream is accepted, of known length or not. */
    put(
        key: string,
        body: ReadableStream | Uint8Array,
        opts?: StoragePutOptions
    ): Promise<void>;
    get(key: string, opts?: { range?: StorageRange }): Promise<StorageObject | null>;
    stat(key: string): Promise<StorageStat | null>;
    delete(key: string): Promise<void>;
    list(
        prefix: string,
        opts?: { cursor?: string; limit?: number }
    ): Promise<StorageList>;

    // Optional capabilities, feature-detected at the call site. Detection is
    // load-bearing, not politeness: an R2 binding cannot sign URLs at all and
    // `filesystem()` cannot either, so these are genuinely absent on shipped
    // drivers. Never assume a method exists.
    /** Permanent, cacheable, CDN-frontable URL. Null when the driver has none. */
    getPublicUrl?(key: string): string | null;
    /** Time-limited upload URL for direct client uploads. */
    getSignedUploadUrl?(
        key: string,
        opts: { expiresIn: number; contentType?: string }
    ): Promise<string>;
    /** Time-limited download URL. */
    getSignedDownloadUrl?(key: string, opts: { expiresIn: number }): Promise<string>;
};
