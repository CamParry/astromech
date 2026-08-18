/**
 * The one media/image driver pairing that cannot work.
 */

import type { MediaAccess } from '@/types/index';
import { CLOUDFLARE_IMAGES_DRIVER } from '@/utilities/image-drivers';
import { AstromechError } from '@/errors/index';

/**
 * `media.access: 'private'` and the Cloudflare Images driver cannot coexist.
 * That driver transforms *by URL* — it hands `originUrl` (our own media route)
 * to Cloudflare's network and lets Cloudflare fetch the origin itself. A private
 * media route refuses exactly that request, so every optimised image would fail
 * at the edge. Caught here, at config resolution, rather than in production.
 */
export function assertMediaAccessCompatible(
    access: MediaAccess,
    imageDriverName: string | undefined
): void {
    if (access !== 'private' || imageDriverName !== CLOUDFLARE_IMAGES_DRIVER) return;
    throw new AstromechError(
        `\`media.access: 'private'\` cannot be combined with the ` +
            `\`${CLOUDFLARE_IMAGES_DRIVER}\` image driver: it transforms by URL, so ` +
            `Cloudflare's network must be able to fetch your media route, which a ` +
            `private route refuses. Either set \`media.access: 'public'\`, or use a ` +
            `different image driver (e.g. \`sharp()\`).`
    );
}
