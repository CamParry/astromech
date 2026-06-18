/**
 * Image header dimension reader.
 *
 * Reads intrinsic pixel dimensions from the leading bytes of an image without
 * fully decoding it. Uses Uint8Array + DataView exclusively — no Node Buffer
 * APIs — so it runs safely on Cloudflare Workers.
 */

/** True only for raster bitmap types we can optimise (transform). Excludes svg, gif, video, pdf, etc. */
export function isOptimisableImage(mimeType: string): boolean {
    const normalised = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
    return (
        normalised === 'image/jpeg' ||
        normalised === 'image/png' ||
        normalised === 'image/webp' ||
        normalised === 'image/avif' ||
        normalised === 'image/heic' ||
        normalised === 'image/heif' ||
        normalised === 'image/tiff'
    );
}

/** Read intrinsic pixel dimensions from image header bytes. Returns null if the format
 *  is unrecognised or the header is too short to determine size. */
export function readImageDimensions(
    bytes: Uint8Array
): { width: number; height: number } | null {
    if (bytes.length < 8) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // PNG: signature 89 50 4E 47 0D 0A 1A 0A
    if (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return readPng(view);
    }

    // GIF: GIF87a or GIF89a
    if (
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) &&
        bytes[5] === 0x61
    ) {
        return readGif(view);
    }

    // JPEG: FF D8
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        return readJpeg(view);
    }

    // WebP: RIFF....WEBP
    if (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return readWebp(view);
    }

    return null;
}

function readPng(view: DataView): { width: number; height: number } | null {
    // IHDR chunk starts at offset 8; width at 16, height at 20
    if (view.byteLength < 24) return null;
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return { width, height };
}

function readGif(view: DataView): { width: number; height: number } | null {
    // width at offset 6, height at offset 8, both LE uint16
    if (view.byteLength < 10) return null;
    const width = view.getUint16(6, true);
    const height = view.getUint16(8, true);
    return { width, height };
}

function readJpeg(view: DataView): { width: number; height: number } | null {
    let offset = 2; // skip FF D8

    while (offset + 3 < view.byteLength) {
        // Skip padding FF bytes
        if (view.getUint8(offset) !== 0xff) return null;
        offset += 1;

        let marker = view.getUint8(offset);
        offset += 1;

        // Skip any additional padding FF bytes
        while (marker === 0xff) {
            if (offset >= view.byteLength) return null;
            marker = view.getUint8(offset);
            offset += 1;
        }

        // SOF markers: C0–CF except C4 (DHT), C8 (JPEGext), CC (DAC)
        if (
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc
        ) {
            // height at marker offset + 5, width at marker offset + 7
            // At this point offset points right after the marker byte;
            // segment length (2 bytes) then precision (1 byte) then height (2 bytes) then width (2 bytes)
            if (offset + 6 > view.byteLength) return null;
            const height = view.getUint16(offset + 3, false);
            const width = view.getUint16(offset + 5, false);
            return { width, height };
        }

        // Read segment length to skip (length includes the 2 length bytes itself)
        if (offset + 1 >= view.byteLength) return null;
        const segLength = view.getUint16(offset, false);
        if (segLength < 2) return null;
        offset += segLength;
    }

    return null;
}

function readWebp(view: DataView): { width: number; height: number } | null {
    if (view.byteLength < 16) return null;

    // Chunk fourCC at offset 12
    const c0 = view.getUint8(12);
    const c1 = view.getUint8(13);
    const c2 = view.getUint8(14);
    const c3 = view.getUint8(15);

    // VP8 (lossy): 'VP8 ' = 56 50 38 20
    if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x20) {
        if (view.byteLength < 30) return null;
        const width = view.getUint16(26, true) & 0x3fff;
        const height = view.getUint16(28, true) & 0x3fff;
        return { width, height };
    }

    // VP8L (lossless): 'VP8L' = 56 50 38 4C
    if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x4c) {
        if (view.byteLength < 25) return null;
        const bits = view.getUint32(21, true);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
    }

    // VP8X (extended): 'VP8X' = 56 50 38 58
    if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x58) {
        if (view.byteLength < 30) return null;
        // LE uint24 at offset 24 and 27
        const width =
            view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16);
        const height =
            view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16);
        return { width: width + 1, height: height + 1 };
    }

    return null;
}
