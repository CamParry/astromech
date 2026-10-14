/**
 * The one media/image driver pairing that cannot work.
 */

import type { MediaAccess } from '@/types/index';
import { AstromechError } from '@/errors/astromech-error';
import { CLOUDFLARE_IMAGES_DRIVER } from '@/media/image-drivers';

/**
 * `media.access: 'private'` and the Cloudflare Images driver cannot coexist:
 * that driver transforms by URL, handing `originUrl` to Cloudflare's network
 * to fetch with no session. `private` keeps originals behind the media route so
 * access can be checked there, and this driver needs them fetchable by anyone
 * with the URL. Caught at config resolution.
 */
export function assertMediaAccessCompatible(
    access: MediaAccess,
    imageDriverName: string | undefined
): void {
    if (access !== 'private' || imageDriverName !== CLOUDFLARE_IMAGES_DRIVER) return;
    throw new AstromechError(
        `\`media.access: 'private'\` cannot be combined with the ` +
            `\`${CLOUDFLARE_IMAGES_DRIVER}\` image driver: it transforms by URL, so ` +
            `Cloudflare's network fetches each original from your media route with ` +
            `no session. \`private\` keeps originals behind that route so access can ` +
            `be checked there, and this driver needs them fetchable by anyone with ` +
            `the URL. Either set \`media.access: 'public'\`, or use a different ` +
            `image driver (e.g. \`sharp()\`).`
    );
}
