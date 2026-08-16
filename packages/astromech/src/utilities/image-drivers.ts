/**
 * Image driver names, held here so config resolution can recognise a driver
 * without importing the driver itself.
 */

/**
 * Driver name. Exported because config resolution has to recognise this driver
 * to reject `media.access: 'private'` alongside it — Cloudflare's network must
 * be able to fetch the origin URL itself.
 */
export const CLOUDFLARE_IMAGES_DRIVER = 'cloudflare-images';
