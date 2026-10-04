import { isOptimisableImage, normaliseMimeType } from './dimensions';
import { getImageConfig } from './registry';

/**
 * Whether the configured image driver can make variants of a file of
 * `mimeType`: an optimisable type the driver does not turn down.
 */
export async function canTransformImage(mimeType: string): Promise<boolean> {
    const imageConfig = getImageConfig();
    if (!imageConfig || !isOptimisableImage(mimeType)) return false;
    return (await imageConfig.driver.canTransform?.(normaliseMimeType(mimeType))) ?? true;
}
