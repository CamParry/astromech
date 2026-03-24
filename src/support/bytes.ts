/**
 * Byte / file size utilities
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Format a byte count as a human-readable string.
 * formatBytes(1024) → '1 KB'
 * formatBytes(1536, 1) → '1.5 KB'
 */
export function formatBytes(bytes: number, decimals = 0): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const unit = UNITS[Math.min(i, UNITS.length - 1)]!;
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(decimals)} ${unit}`;
}
